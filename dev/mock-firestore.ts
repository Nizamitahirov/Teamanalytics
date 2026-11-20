// Firestore REST API-nin yaddaşda təqlidi — lokal dev server və server testləri üçün.
// Dəstəklənir: :commit (update/updateMask/updateTransforms/delete), :runQuery (sahə/kompozit filtrlər, sıralama, limit),
// sənəd GET, kolleksiya siyahısı (pageSize). Real Firebase-ə toxunmur.
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export const MOCK_PROJECT = 'demo';
const DOCS_PREFIX = `projects/${MOCK_PROJECT}/databases/(default)/documents`;
const ROOTP = `/v1/${DOCS_PREFIX}`;

type Value = Record<string, unknown>;
type Fields = Record<string, Value>;
type Write = {
  update?: { name: string; fields?: Fields };
  updateMask?: { fieldPaths: string[] };
  updateTransforms?: { fieldPath: string; increment?: { integerValue: string } }[];
  delete?: string;
};

export type MockFirestore = {
  port: number;
  url: string;
  docs: Map<string, Fields>;
  calls: string[];
  /** Sənədləri sadə JSON kimi ({kolleksiya/id: {sahə: dəyər}}) qaytarır. */
  dump: () => Record<string, Record<string, unknown>>;
  reset: () => void;
  close: () => Promise<void>;
};

const short = (n: string) => n.split('/documents/')[1];
const tsOf = (v: Value | undefined) => (v && 'timestampValue' in v ? String(v.timestampValue) : '');
const unquote = (p: string) => (p.startsWith('`') ? p.slice(1, -1).replace(/\\(.)/g, '$1') : p);

/** Mock serveri işə salır. `port: 0` → təsadüfi boş port (testlər üçün). */
export async function startMockFirestore({ port = 0, latencyMs = 0 } = {}): Promise<MockFirestore> {
  const docs = new Map<string, Fields>();
  const calls: string[] = [];
  let tick = 0;
  let txSeq = 0;
  // Tranzaksiya: oxunan sənədlərin oxunma anındakı _ts-i; commit zamanı dəyişibsə → 409 ABORTED (real Firestore kimi)
  const txReads = new Map<string, Map<string, string>>();
  const verOf = (name: string) => tsOf(docs.get(name)?._ts) || 'absent';
  const nowTs = () => {
    const d = new Date();
    const us = String(d.getMilliseconds() * 1000 + (tick++ % 1000)).padStart(6, '0');
    return d.toISOString().slice(0, 19) + '.' + us + 'Z';
  };

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url || '/', 'http://x');
    let raw = '';
    for await (const c of req) raw += c;
    const j = raw ? JSON.parse(raw) : {};
    const p = decodeURIComponent(u.pathname);
    calls.push(`${req.method} ${p.replace(ROOTP, '')}`);
    const out = (o: unknown, st = 200) => {
      res.statusCode = st;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(o));
    };
    if (latencyMs) await new Promise((r) => setTimeout(r, latencyMs));
    const docOut = (name: string) => ({ name, fields: docs.get(name) });

    if (p === ROOTP + ':beginTransaction') {
      const id = Buffer.from(`tx-${++txSeq}`).toString('base64');
      txReads.set(id, new Map());
      return out({ transaction: id });
    }
    if (p === ROOTP + ':rollback') {
      txReads.delete(j.transaction);
      return out({});
    }
    if (p === ROOTP + ':batchGet') {
      const reads = j.transaction ? txReads.get(j.transaction) : undefined;
      const res = (j.documents as string[]).map((n) => {
        const name = `${DOCS_PREFIX}/${short(n)}`;
        reads?.set(name, verOf(name));
        return docs.has(name) ? { found: docOut(name), readTime: nowTs() } : { missing: n, readTime: nowTs() };
      });
      return out(res);
    }
    if (p === ROOTP + ':commit') {
      if (j.transaction) {
        const reads = txReads.get(j.transaction);
        txReads.delete(j.transaction);
        if (!reads) return out({ error: { code: 400, message: 'Transaction not found', status: 'INVALID_ARGUMENT' } }, 400);
        for (const [name, v] of reads)
          if (verOf(name) !== v)
            return out({ error: { code: 409, message: 'Transaction lock timeout / contention', status: 'ABORTED' } }, 409);
      }
      const ts = nowTs();
      for (const w of j.writes as Write[]) {
        if (w.delete) {
          docs.delete(short(w.delete) ? `${DOCS_PREFIX}/${short(w.delete)}` : w.delete);
          continue;
        }
        const name = `${DOCS_PREFIX}/${short(w.update!.name)}`;
        const incoming = w.update!.fields || {};
        let fields: Fields;
        if (w.updateMask) {
          // Firestore semantikası: maskadakı sahə gövdədə yoxdursa silinir; maskada olmayan sahələr toxunulmaz
          fields = { ...(docs.get(name) || {}) };
          for (const fp of w.updateMask.fieldPaths.map(unquote)) {
            if (fp in incoming) fields[fp] = incoming[fp];
            else delete fields[fp];
          }
        } else fields = { ...incoming };
        (w.updateTransforms || []).forEach((t) => {
          if (t.increment) {
            const prev = fields[t.fieldPath];
            const n = prev && 'integerValue' in prev ? Number(prev.integerValue) : 0;
            fields[t.fieldPath] = { integerValue: String(n + Number(t.increment.integerValue)) };
          } else fields[t.fieldPath] = { timestampValue: ts };
        });
        docs.set(name, fields);
      }
      return out({ commitTime: ts, writeResults: (j.writes as Write[]).map(() => ({})) });
    }
    if (p === ROOTP + ':runQuery') {
      const q = j.structuredQuery;
      const coll = q.from[0].collectionId;
      let list = [...docs.keys()].filter((n) => short(n).split('/')[0] === coll).map(docOut);
      // Filtrlər: fieldFilter (EQUAL, GREATER_THAN, GREATER_THAN_OR_EQUAL, LESS_THAN, LESS_THAN_OR_EQUAL) və compositeFilter AND
      type FF = { field: { fieldPath: string }; op: string; value: Value };
      const val = (v: Value | undefined) => {
        if (!v) return undefined;
        if ('timestampValue' in v) return tsOf(v);
        if ('integerValue' in v) return Number(v.integerValue);
        return Object.values(v)[0] as unknown;
      };
      const test = (d: { fields?: Fields }, f: FF) => {
        const a = val(d.fields?.[f.field.fieldPath]);
        const b = val(f.value);
        if (a === undefined) return false;
        switch (f.op) {
          case 'EQUAL':
            return JSON.stringify(a) === JSON.stringify(b);
          case 'GREATER_THAN':
            return (a as string) > (b as string);
          case 'GREATER_THAN_OR_EQUAL':
            return (a as string) >= (b as string);
          case 'LESS_THAN':
            return (a as string) < (b as string);
          case 'LESS_THAN_OR_EQUAL':
            return (a as string) <= (b as string);
          default:
            return false;
        }
      };
      if (q.where) {
        const filters: FF[] = q.where.compositeFilter
          ? q.where.compositeFilter.filters.map((x: { fieldFilter: FF }) => x.fieldFilter)
          : [q.where.fieldFilter];
        list = list.filter((d) => filters.every((f) => test(d, f)));
      }
      if (q.orderBy) {
        const fp = q.orderBy[0].field.fieldPath;
        const desc = q.orderBy[0].direction === 'DESCENDING';
        list.sort((x, y) => {
          const a = String(val(x.fields?.[fp]) ?? '');
          const b = String(val(y.fields?.[fp]) ?? '');
          return (a < b ? -1 : a > b ? 1 : 0) * (desc ? -1 : 1);
        });
      }
      if (q.limit) list = list.slice(0, q.limit);
      return out(list.length ? list.map((document) => ({ document, readTime: nowTs() })) : [{ readTime: nowTs() }]);
    }
    if (req.method === 'GET' && p.startsWith(ROOTP + '/')) {
      const rest = p.slice(ROOTP.length + 1).split('/');
      if (rest.length === 2) {
        const n = `${DOCS_PREFIX}/${rest.join('/')}`;
        return docs.has(n) ? out(docOut(n)) : out({ error: { message: 'not found' } }, 404);
      }
      let list = [...docs.keys()].filter((n) => short(n).split('/')[0] === rest[0]).map(docOut);
      const ps = Number(u.searchParams.get('pageSize') || 1000);
      list = list.slice(0, ps);
      return out(list.length ? { documents: list } : {});
    }
    out({ error: { message: 'not mocked ' + p } }, 404);
  });

  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  const actual = (server.address() as AddressInfo).port;
  return {
    port: actual,
    url: `http://127.0.0.1:${actual}/v1`,
    docs,
    calls,
    dump: () =>
      Object.fromEntries(
        [...docs].map(([k, f]) => [short(k), Object.fromEntries(Object.entries(f).map(([a, b]) => [a, Object.values(b)[0]]))]),
      ),
    reset: () => {
      docs.clear();
      calls.length = 0;
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

/** Server modullarını mock-a yönəldən mühit dəyişənləri. */
export function mockEnv(url: string): Record<string, string> {
  return {
    FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
      project_id: MOCK_PROJECT,
      client_email: 'x@demo',
      private_key: '-----BEGIN PRIVATE KEY-----\nAA\n-----END PRIVATE KEY-----\n',
    }),
    FIRESTORE_FAKE_TOKEN: 'fake',
    FIRESTORE_API_BASE: url,
  };
}

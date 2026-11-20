// Ssenarilər və təsdiq axını (SPEC §2, §6.5) — server məntiqi (Vercel-dən asılı deyil, testlənir).
// Ssenarinin özü canlı dataya HEÇ NƏ yazmır: tətbiq klientdə /api/ops ilə (versiya yoxlaması ilə) olur,
// sonra klient `applied` ilə statusu və geri alma op-larını qeyd edir.
import { MAX_SCENARIO_BYTES } from '../shared/constants.js';
import type { Notification, NotificationKind, Op, Role, Scenario, ScenariosBody } from '../shared/schema.js';
import { commitWrites, docSoftDelete, docUpsert, getDoc, getMeta, listScenarios, listUsers, type Doc } from './firestore.js';
import type { UserInfo } from './auth.js';
import { scenarioFromRow as scenarioFromDoc } from '../shared/scenarioDoc.js';

export class ScenarioError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function getScenarios(): Promise<Scenario[]> {
  return (await listScenarios()).map(scenarioFromDoc).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

const json = (v: unknown) => {
  const out = JSON.stringify(v);
  if (out.length > MAX_SCENARIO_BYTES)
    throw new ScenarioError(413, 'too_large', 'Ssenari çox böyükdür — dəyişiklikləri bir neçə ssenariyə bölün');
  return out;
};
const newNotificationId = () => 'N-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const rank: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };
const need = (me: UserInfo, role: Role) => {
  if (rank[me.role] < rank[role]) throw new ScenarioError(403, 'forbidden', 'Bu əməliyyat üçün icazəniz yoxdur');
};

/** Təsdiq axını açıqdırmı (meta/main.approval = 1) */
export async function approvalOn(): Promise<boolean> {
  const meta = await getMeta();
  return Number(meta?.approval) === 1;
}

function notification(to: string, kind: NotificationKind, text: string, link: string, ts: string) {
  const n: Omit<Notification, 'id'> = { to, kind, text, link, read: false, ts };
  return docUpsert('notifications', newNotificationId(), n);
}
async function adminsExcept(name: string): Promise<string[]> {
  return (await listUsers()).filter((u) => u.active && u.role === 'admin' && u.name !== name).map((u) => u.name);
}

/**
 * POST /api/scenarios əməliyyatları. Rol qaydaları (SPEC §2):
 * viewer — heç biri; editor — yarat/düzəlt/sil/təsdiqə göndər/arxivlə, təsdiq axını SÖNDÜRÜLÜDÜRSƏ tətbiq;
 * admin — hamısı + rədd et, təsdiq axını açıq olsa da tətbiq (= təsdiq).
 */
export async function scenarioAction(b: ScenariosBody, me: UserInfo, audit: Record<string, string>): Promise<Scenario | null> {
  need(me, 'editor');
  if (b.action === 'reject') need(me, 'admin');
  const ts = new Date().toISOString();
  const link = `/scenarios/${b.id}`;
  const log = (task_label: string, comment = ''): Op => ({
    t: 'log',
    row: { action: 'Ssenari', task_label, comment, group: b.id },
  });

  if (b.action === 'create') {
    if (await getDoc('scenarios', b.id)) throw new ScenarioError(409, 'exists', 'Bu id ilə ssenari artıq var');
    const submit = !!b.submit;
    if (submit && !(await approvalOn())) throw new ScenarioError(400, 'approval_off', 'Təsdiq axını söndürülüdür');
    const row = {
      id: b.id,
      name: b.name,
      description: b.description ?? '',
      base_ts: b.base_ts ?? '',
      status: submit ? 'pending' : 'draft',
      changes: json(b.changes),
      summary: b.summary ? json(b.summary) : '',
      created_by: me.name,
      created_at: ts,
      updated_by: me.name,
      updated_at: ts,
      ...(submit ? { submitted_by: me.name, submitted_at: ts } : {}),
    };
    const writes = [docUpsert('scenarios', b.id, row)];
    if (submit)
      for (const a of await adminsExcept(me.name))
        writes.push(notification(a, 'approval_request', `${me.name} təsdiq gözləyir: «${b.name}»`, link, ts));
    await commitWrites(writes, [log(`Ssenari yaradıldı: ${b.name}`, submit ? 'Təsdiqə göndərildi' : '')], me.name, audit);
    return scenarioFromDoc(row);
  }

  const doc = await getDoc('scenarios', b.id);
  if (!doc || doc._deleted) throw new ScenarioError(404, 'not_found', 'Ssenari tapılmadı');
  const cur = scenarioFromDoc(doc as Doc);
  const isAdmin = me.role === 'admin';
  const write = async (patch: Record<string, unknown>, extra: ReturnType<typeof docUpsert>[] = [], logs: Op[] = []) => {
    const row = { ...patch, updated_by: me.name, updated_at: ts };
    await commitWrites([docUpsert('scenarios', b.id, row), ...extra], logs, me.name, audit);
    return scenarioFromDoc({ ...doc, ...row });
  };

  switch (b.action) {
    case 'update': {
      if (cur.status === 'applied') throw new ScenarioError(409, 'applied', 'Tətbiq edilmiş ssenari dəyişdirilə bilməz');
      if (cur.status === 'archived') throw new ScenarioError(409, 'archived', 'Arxivdəki ssenarini əvvəlcə bərpa edin');
      const patch: Record<string, unknown> = {};
      if (b.name !== undefined) patch.name = b.name;
      if (b.description !== undefined) patch.description = b.description;
      if (b.changes !== undefined) patch.changes = json(b.changes);
      if (b.summary !== undefined) patch.summary = json(b.summary);
      // Təsdiq gözləyən ssenari dəyişirsə — yenidən qaralama (admin başqasının qərarını dəyişmiş versiyaya verməsin)
      if (cur.status === 'pending' && b.changes !== undefined) patch.status = 'draft';
      return write(patch);
    }
    case 'delete': {
      if (cur.status === 'applied') throw new ScenarioError(409, 'applied', 'Tətbiq edilmiş ssenari silinmir — arxivləyin');
      if (!isAdmin && cur.created_by !== me.name)
        throw new ScenarioError(403, 'forbidden', 'Başqasının ssenarisini yalnız administrator silə bilər');
      await commitWrites([docSoftDelete('scenarios', b.id)], [log(`Ssenari silindi: ${cur.name}`)], me.name, audit);
      return null;
    }
    case 'submit': {
      if (!(await approvalOn())) throw new ScenarioError(400, 'approval_off', 'Təsdiq axını söndürülüdür');
      if (cur.status !== 'draft') throw new ScenarioError(409, 'bad_status', 'Yalnız qaralama təsdiqə göndərilə bilər');
      if (!cur.changes.length) throw new ScenarioError(400, 'empty', 'Ssenaridə dəyişiklik yoxdur');
      const extra = (await adminsExcept(me.name)).map((a) =>
        notification(a, 'approval_request', `${me.name} təsdiq gözləyir: «${cur.name}»`, link, ts),
      );
      return write({ status: 'pending', submitted_by: me.name, submitted_at: ts, decision_comment: '' }, extra, [
        log(`Təsdiqə göndərildi: ${cur.name}`),
      ]);
    }
    case 'reject': {
      need(me, 'admin');
      if (cur.status !== 'pending') throw new ScenarioError(409, 'bad_status', 'Ssenari təsdiq gözləmir');
      const to = cur.submitted_by || cur.created_by;
      const text = `«${cur.name}» rədd edildi${b.comment ? `: ${b.comment}` : ''}`;
      return write(
        { status: 'draft', decided_by: me.name, decided_at: ts, decision_comment: b.comment ?? '' },
        to && to !== me.name ? [notification(to, 'rejected', text, link, ts)] : [],
        [log(`Rədd edildi: ${cur.name}`, b.comment ?? '')],
      );
    }
    case 'applied': {
      if (cur.status === 'applied') throw new ScenarioError(409, 'applied', 'Ssenari artıq tətbiq edilib');
      if (cur.status === 'archived') throw new ScenarioError(409, 'archived', 'Arxivdəki ssenari tətbiq edilmir');
      if (!isAdmin && (await approvalOn()))
        throw new ScenarioError(403, 'approval_required', 'Təsdiq axını açıqdır — ssenarini təsdiqə göndərin');
      const to = cur.submitted_by || cur.created_by;
      const wasPending = cur.status === 'pending';
      const extra =
        wasPending && to && to !== me.name
          ? [notification(to, 'approved', `«${cur.name}» təsdiqləndi və tətbiq edildi`, link, ts)]
          : [];
      return write(
        {
          status: 'applied',
          applied_by: me.name,
          applied_at: ts,
          revert: json(b.revert),
          ...(wasPending ? { decided_by: me.name, decided_at: ts } : {}),
        },
        extra,
      );
    }
    case 'reverted': {
      if (cur.status !== 'applied') throw new ScenarioError(409, 'bad_status', 'Ssenari tətbiq edilməyib');
      if (!isAdmin && (await approvalOn()))
        throw new ScenarioError(403, 'approval_required', 'Təsdiq axını açıqdır — geri almanı administrator edir');
      return write({ status: 'archived', reverted_by: me.name, reverted_at: ts });
    }
    case 'archive': {
      if (cur.status === 'archived') return cur;
      return write({ status: 'archived' });
    }
    case 'restore': {
      if (cur.status !== 'archived') return cur;
      return write({ status: cur.applied_at && !cur.reverted_at ? 'applied' : 'draft' });
    }
  }
}

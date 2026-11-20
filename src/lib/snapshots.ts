// Gündəlik snapshot-lar (SPEC §7.10) — trend vidjeti və dövr müqayisəsi üçün. Yaddaşda 10 dəq keşlənir
// (Firestore büdcəsi: bir sorğu ≈ gün sayı qədər oxuma).
import { api } from './api';
import type { SnapshotData } from '../../shared/snapshot';

export type { SnapshotData };
const cache = new Map<string, { t: number; p: Promise<SnapshotData[]> }>();

export const isoDay = (d: Date) => new Date(d.getTime() + 4 * 3600e3).toISOString().slice(0, 10);

export function fetchSnapshots(from: string, to: string): Promise<SnapshotData[]> {
  const k = `${from}|${to}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.t < 600_000) return hit.p;
  const p = api<{ snapshots: SnapshotData[] }>(`/api/snapshots?from=${from}&to=${to}`).then((r) => r.snapshots);
  p.catch(() => cache.delete(k));
  cache.set(k, { t: Date.now(), p });
  return p;
}

// Ssenari sənədi (Firestore: JSON sahələri sətir kimi) → tipli obyekt. Server və klient eyni koddan istifadə edir.
import type { Op, Scenario, ScenarioChange } from './schema.js';

const parse = <T>(v: unknown, fallback: T): T => {
  if (typeof v !== 'string' || !v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};
const s = (v: unknown) => (v == null ? '' : String(v));

/** Firestore sənədi → klient forması (JSON sahələri açılır). */
export function scenarioFromRow(d: Record<string, unknown>): Scenario {
  const status = s(d.status);
  return {
    id: s(d.id || d._id),
    name: s(d.name),
    description: s(d.description),
    base_ts: s(d.base_ts),
    status: (['draft', 'pending', 'applied', 'archived'].includes(status) ? status : 'draft') as Scenario['status'],
    changes: parse<ScenarioChange[]>(d.changes, []),
    summary: parse(d.summary, null),
    created_by: s(d.created_by),
    created_at: s(d.created_at),
    updated_by: s(d.updated_by),
    updated_at: s(d.updated_at),
    submitted_by: s(d.submitted_by),
    submitted_at: s(d.submitted_at),
    decided_by: s(d.decided_by),
    decided_at: s(d.decided_at),
    decision_comment: s(d.decision_comment),
    applied_by: s(d.applied_by),
    applied_at: s(d.applied_at),
    reverted_by: s(d.reverted_by),
    reverted_at: s(d.reverted_at),
    revert: parse<Op[]>(d.revert, []),
  };
}

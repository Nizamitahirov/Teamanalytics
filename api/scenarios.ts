import { getScenarios, scenarioAction, ScenarioError } from '../server/scenarios.js';
import {
  requireUser,
  requestIpHash,
  send,
  sendError,
  parseBody,
  methodNotAllowed,
  fail,
  type Req,
  type Res,
} from '../server/http.js';
import { ScenariosBodySchema } from '../shared/schema.js';

// GET  /api/scenarios → { scenarios } (hamı oxuyur — viewer ssenarilərə baxa bilir, SPEC §2)
// POST /api/scenarios { action, id, ... } → { ok, scenario } (editor+; rədd et — admin; təsdiq axını qaydaları server/scenarios.ts)
export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, 'GET və ya POST');
  const me = await requireUser(req, res, req.method === 'GET' ? 'viewer' : 'editor');
  if (!me) return;
  try {
    if (req.method === 'GET') return send(res, 200, { scenarios: await getScenarios() });
    const b = await parseBody(req, res, ScenariosBodySchema);
    if (!b) return;
    const scenario = await scenarioAction(b, me, { ip_hash: await requestIpHash(req) });
    send(res, 200, { ok: true, scenario });
  } catch (e) {
    if (e instanceof ScenarioError) return sendError(res, e.status, e.code, e.message);
    fail(res, e);
  }
}

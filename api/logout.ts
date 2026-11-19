import { sessionCookie } from '../server/auth.js';
import { send, type Req, type Res } from '../server/http.js';

export default function handler(_req: Req, res: Res) {
  send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
}

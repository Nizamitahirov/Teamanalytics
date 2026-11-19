import { sessionCookie } from '../lib/auth.js';
import { send } from '../lib/http.js';

export default function handler(req, res) {
  send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
}

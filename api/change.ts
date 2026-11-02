// POST /api/change: Gemini reads a plain-words change; code validates it before the person confirms.
import { route } from '../server/http.ts';
import { ChangeRequest } from '../server/requests.ts';
import { runChange } from '../server/tasks.ts';

export const config = { maxDuration: 60 };

export default route(ChangeRequest, (body, env) => runChange(body, env));

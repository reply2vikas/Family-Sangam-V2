// POST /api/message: Gemini drafts an invitation or vendor message in English, Hindi or Hinglish.
import { route } from '../server/http.ts';
import { MessageRequest } from '../server/requests.ts';
import { runMessage } from '../server/writing.ts';

export const config = { maxDuration: 60 };

export default route(MessageRequest, (body, env) => runMessage(body, env));

// POST /api/brief: Gemini turns a plain-words description of the season into events and income.
import { route } from '../server/http.ts';
import { BriefRequest } from '../server/requests.ts';
import { runBrief } from '../server/tasks.ts';

export const config = { maxDuration: 60 };

export default route(BriefRequest, (body, env) => runBrief(body, env));

// POST /api/ideas: Personalised ideas for one event, from Gemini or labelled samples.
import { route } from '../server/http.ts';
import { IdeasRequest } from '../server/requests.ts';
import { runIdeas } from '../server/tasks.ts';

export const config = { maxDuration: 60 };

export default route(IdeasRequest, (body, env) => runIdeas(body, env));

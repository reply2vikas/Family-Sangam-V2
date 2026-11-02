// POST /api/explain: A family summary whose numbers are checked against the plan.
import { route } from '../server/http.ts';
import { ExplainRequest } from '../server/requests.ts';
import { runExplain } from '../server/more.ts';

export const config = { maxDuration: 60 };

export default route(ExplainRequest, (body, env) => runExplain(body, env));

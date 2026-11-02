// POST /api/savings: Savings ideas whose amounts are capped by code.
import { route } from '../server/http.ts';
import { SavingsRequest } from '../server/requests.ts';
import { runSavings } from '../server/more.ts';

export const config = { maxDuration: 60 };

export default route(SavingsRequest, (body, env) => runSavings(body, env));

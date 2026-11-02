// POST /api/quote: Gemini reads a pasted vendor quote; code compares it with the plan.
import { route } from '../server/http.ts';
import { QuoteRequest } from '../server/requests.ts';
import { runQuote } from '../server/writing.ts';

export const config = { maxDuration: 60 };

export default route(QuoteRequest, (body, env) => runQuote(body, env));

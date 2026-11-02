// POST /api/runshow: A day-of schedule for one event.
import { route } from '../server/http.ts';
import { EventHelpRequest } from '../server/requests.ts';
import { runRunshow } from '../server/more.ts';

export const config = { maxDuration: 60 };

export default route(EventHelpRequest, (body, env) => runRunshow(body, env));

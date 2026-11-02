// POST /api/rsvp: Counts pasted guest replies.
import { route } from '../server/http.ts';
import { RsvpRequest } from '../server/requests.ts';
import { runRsvp } from '../server/more.ts';

export const config = { maxDuration: 60 };

export default route(RsvpRequest, (body, env) => runRsvp(body, env));

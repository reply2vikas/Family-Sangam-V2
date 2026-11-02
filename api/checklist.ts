// POST /api/checklist: Extra checklist items for one event.
import { route } from '../server/http.ts';
import { EventHelpRequest } from '../server/requests.ts';
import { runChecklist } from '../server/more.ts';

export const config = { maxDuration: 60 };

export default route(EventHelpRequest, (body, env) => runChecklist(body, env));

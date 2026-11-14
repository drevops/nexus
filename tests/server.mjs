/**
 * Serves the current folder for local dev and e2e tests, on the port in PORT
 * or 8000.
 */
import { createStaticServer } from './static-server.mjs';

const PORT = Number(process.env.PORT) || 8000;
const ROOT = process.cwd();

createStaticServer(ROOT).listen(PORT, () => {
  console.log('Nexus serving ' + ROOT + ' on http://localhost:' + PORT);
});

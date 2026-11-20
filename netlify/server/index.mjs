import {createServer} from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
// Guarantee an ephemeral filesystem cannot masquerade as live customer storage.
process.env.SPC_STORAGE_BACKEND='netlify';
export default createServer(require('../../server.js'));

'use strict';
const fs = require('node:fs/promises');
const {getStore} = require('@netlify/blobs');
const {openNetlifyStore} = require('../netlify-storage');
const {netlifyRecords, verifyArchive} = require('../netlify-records');

async function main() {
  const [command, file] = process.argv.slice(2);
  const key = process.env.BACKUP_ENCRYPTION_KEY;
  if (!/^[a-f0-9]{64}$/i.test(key || '')) throw Error('BACKUP_ENCRYPTION_KEY is required.');
  if (!['init', 'inventory', 'backup', 'verify', 'restore'].includes(command) ||
      (['backup', 'verify', 'restore'].includes(command) && !file)) {
    throw Error('Usage: node scripts/netlify-records.cjs init|inventory|backup|verify|restore [file]');
  }

  const read = async () => JSON.parse(await fs.readFile(file, 'utf8'));
  if (command === 'verify') {
    console.log(JSON.stringify({verified: true, counts: verifyArchive(await read(), key)}));
    return;
  }

  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token || !process.env.SPC_STORAGE_NAMESPACE) {
    throw Error('NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN and SPC_STORAGE_NAMESPACE are required.');
  }
  const store = openNetlifyStore(options => getStore({...options, siteID, token}));
  const operation = netlifyRecords(store, process.env.SPC_STORAGE_NAMESPACE, key);

  if (command === 'init' || command === 'restore') {
    const counts = command === 'init' ? await operation.init() : await operation.restore(await read());
    console.log(JSON.stringify({verified: true, counts}));
    return;
  }

  const archive = await operation.backup();
  const counts = verifyArchive(archive, key);
  if (command === 'backup') {
    const handle = await fs.open(file, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(archive));
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  console.log(JSON.stringify({verified: true, counts}));
}

main().catch(error => {
  // SDK errors can contain provider request details. Keep credentials and object contents out of logs.
  console.error(error.constructor === Error ? error.message : 'The storage operation did not complete. Check the destination and credentials.');
  process.exitCode = 1;
});

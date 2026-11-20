'use strict';

const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const {validateBackup} = require('../onedrive');

function verifyPayload(payload, secret) {
  if (!/^[a-f0-9]{64}$/i.test(secret || '')) throw Error('A valid BACKUP_ENCRYPTION_KEY is required.');
  const entry = JSON.parse(payload);
  if (entry.v !== 1) throw Error('Unrecognized snapshot format.');
  const decipher = crypto.createDecipheriv('aes-256-gcm',Buffer.from(secret,'hex'),Buffer.from(entry.iv,'base64'));
  decipher.setAuthTag(Buffer.from(entry.tag,'base64'));
  const state = JSON.parse(Buffer.concat([decipher.update(Buffer.from(entry.data,'base64')),decipher.final()]));
  validateBackup(JSON.stringify(state.records));
  if (!state.oauth || typeof state.oauth !== 'object') throw Error('Incomplete snapshot.');
}
async function run(mode,file) {
  if (!file || !['export','restore'].includes(mode)) throw Error('Use export FILE or restore FILE.');
  const {getDatabase} = await import('@netlify/database');
  const {pool} = getDatabase();
  try {
    if (mode === 'export') {
      const {rows} = await pool.query("SELECT payload FROM spc_state WHERE id='fresh-production'");
      if (!rows.length) throw Error('No initialized state to export.');
      verifyPayload(rows[0].payload,process.env.BACKUP_ENCRYPTION_KEY);
      await fs.writeFile(file,rows[0].payload,{mode:0o600,flag:'wx'});
    } else {
      const payload = await fs.readFile(file,'utf8');
      verifyPayload(payload,process.env.BACKUP_ENCRYPTION_KEY);
      // An existing tenant can never be replaced, even if two restores race.
      const result = await pool.query("INSERT INTO spc_state (id,revision,payload) VALUES ('fresh-production',0,$1) ON CONFLICT (id) DO NOTHING RETURNING id",[payload]);
      if (result.rowCount !== 1) throw Error('Destination already has records. Restore to an empty migrated database.');
    }
  } finally {await pool.end();}
}
if (require.main === module) run(...process.argv.slice(2)).catch(err=>{console.error(err.message);process.exitCode=1;});
module.exports={verifyPayload};

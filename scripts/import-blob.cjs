'use strict';
// Run manually with owner-reviewed, complete ProConnect exports. Never a build step.
const fs=require('node:fs'),crypto=require('node:crypto');
const {put}=require('@vercel/blob'),{validateBackup}=require('../onedrive');
async function main(){
 const [file,namespace]=process.argv.slice(2);
 if(!file||!/^production$|^preview-[a-zA-Z0-9_-]+$/.test(namespace||''))throw Error('Usage: node scripts/import-blob.cjs <complete-private-export.json> <production|preview-name>');
 const key=process.env.BACKUP_ENCRYPTION_KEY;if(!/^[a-f0-9]{64}$/i.test(key||''))throw Error('Configure the existing encryption key securely. Do not rotate it during recovery.');
 const input=JSON.parse(fs.readFileSync(file,'utf8')),value=input.records?input:{records:input,oauth:{}};
 validateBackup(JSON.stringify(value.records));if(!value.oauth||typeof value.oauth!=='object')throw Error('Invalid OAuth state');
 const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv),data=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);
 const payload=JSON.stringify({v:1,iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:data.toString('base64')});
 await put(`superior-proconnect/${namespace}/state.json.enc`,payload,{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/octet-stream'});
 console.log('Imported complete encrypted snapshot into a new object. Existing objects were not overwritten. Writes remain separately gated.');
}
main().catch(()=>{console.error('Import failed. Verify the source, credentials and destination. Existing objects were not overwritten.');process.exitCode=1;});

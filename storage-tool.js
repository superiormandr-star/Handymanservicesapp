'use strict';
const fs=require('node:fs'),path=require('node:path');
const file=process.env.DATA_FILE||path.join(__dirname,'data','database.json');
function validate(text){const d=JSON.parse(text);for(const k of ['profiles','reviews','intake','documents'])if(!Array.isArray(d[k]))throw Error('Invalid backup: missing '+k);for(const k of ['leads','proAccess','estimateRequests'])if(d[k]!==undefined&&!Array.isArray(d[k]))throw Error('Invalid backup: '+k);return d}
function writePrivate(dest,text){fs.mkdirSync(path.dirname(dest),{recursive:true,mode:0o700});const fd=fs.openSync(dest,'wx',0o600);try{fs.writeFileSync(fd,text);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
try{
 const [command,target]=process.argv.slice(2);
 if(!['backup','restore'].includes(command)||!target)throw Error('Usage: node storage-tool.js backup <new-file> | restore <backup-file>. Stop the app before restoring.');
 if(path.resolve(file)===path.resolve(target))throw Error('Backup path must differ from the live data file.');
 if(command==='backup'){const text=fs.readFileSync(file,'utf8');validate(text);writePrivate(target,text);console.log('Backup created: '+target)}
 else{const text=fs.readFileSync(target,'utf8');validate(text);if(fs.existsSync(file)){const prior=fs.readFileSync(file,'utf8');writePrivate(file+'.before-restore-'+Date.now()+'.json',prior)}fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.restore-'+process.pid;writePrivate(tmp,text);fs.renameSync(tmp,file);console.log('Backup restored. Restart the app to verify records.')}
}catch(e){console.error(e.message);process.exitCode=1}

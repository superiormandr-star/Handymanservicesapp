'use strict';
const { readdirSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const tests = readdirSync(path.join(root, 'tests'))
  .filter(name => name.endsWith('.mjs'))
  .map(name => path.join('tests', name));

// Build environments may set NETLIFY or carry deployment secrets. Each test
// creates its own app credentials and local store.
const inherited = ['PATH', 'SYSTEMROOT', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP', 'TZ', 'CI'];
const env = Object.fromEntries(inherited.filter(name => process.env[name] !== undefined)
  .map(name => [name, process.env[name]]));
const result = spawnSync(process.execPath, ['--test', ...tests], {cwd: root, env, stdio: 'inherit'});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

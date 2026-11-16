import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=read('public/index.html'),script=read('public/app.js'),css=read('public/styles.css'),routes=read('crm-routes.js');

test('customer has a first-class, compact navigation and separate screen',()=>{
 assert.match(html,/href="#customers"[^>]*>Customers<\/a>/);
 assert.match(html,/id="customer-shortcut"/);
 assert.match(html,/id="customers"[^>]*customer-workspace/);
 assert.match(html,/id="customer-request-form"/);
 assert.match(html,/id="customer-industry"/);
 assert.match(html,/id="customer-provider"/);
 assert.match(script,/customers:\['#customers'\]/);
 assert.match(script,/home:\['#customer-shortcut'/);
});
test('customer request is wired to existing private inquiries rather than a dead form',()=>{
 assert.match(script,/\$\('#customer-request-form'\)\.addEventListener\('submit'/);
 assert.match(script,/api\('\/api\/inquiries'/);
 assert.match(script,/profileId:fields\.profileId/);
 assert.match(script,/consent:form\.elements\.consent\.checked/);
 assert.match(routes,/if\(route==='\/api\/inquiries'\)/);
 assert.match(routes,/d\.leads\.push\(record\);save\(d\)/);
});
test('no unsupported private bid feature is advertised as live',()=>{
 assert.match(html,/Private bidding is not active yet/);
 assert.match(css,/@media \(max-width:767px\)/);
 assert.match(css,/\.customer-shortcut-inner/);
 assert.match(css,/\.customer-fields\{grid-template-columns:minmax\(0,1fr\)/);
});

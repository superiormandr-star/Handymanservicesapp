import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=read('public/index.html'),script=read('public/app.js'),
 css=read('public/styles.css'),routes=read('job-routes.js'),server=read('server.js');
test('customer has a first-class compact free Post a Job screen',()=>{
 assert.match(html,/href="#customers"[^>]*>Customers<\/a>/);
 assert.match(html,/id="customer-shortcut"/);
 assert.match(html,/id="customers"[^>]*customer-workspace/);
 assert.match(html,/id="customer-job-form"/);
 assert.match(html,/name="bidLimit"/);
 assert.match(html,/Post job for free/);
 assert.match(script,/customers:\['#customers'\]/);
 assert.match(script,/home:\['#customer-shortcut'/);
});
test('customer creates own job with private link, not direct business inquiry',()=>{
 assert.match(script,/\$\('#customer-job-form'\)\.addEventListener\('submit'/);
 assert.match(script,/api\('\/api\/jobs'/);
 assert.match(script,/ownJobRequest/);
 assert.match(script,/#my-job\//);
 assert.match(routes,/x-customer-key/);
 assert.match(routes,/x-pro-token/);
 assert.match(server,/jobRoutes\(req,res,/);
});
test('bidding privacy, mobile layout and fourth authorization are explicit',()=>{
 assert.match(html,/fourth is allowed unless you explicitly authorize one/);
 assert.match(html,/Your private management link/);
 assert.match(css,/@media \(max-width:767px\)/);
 assert.match(css,/\.customer-shortcut-inner/);
 assert.match(css,/\.customer-fields\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(routes,/approveFourth/);
 assert.match(routes,/confirmedInPayPal/);
});
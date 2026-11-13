const fs=require('node:fs');
const original=global.fetch;
global.fetch=async(url,options={})=>{
 if(!String(url).startsWith('https://api-m.sandbox.paypal.com/'))return original(url,options);
 const fixture=JSON.parse(fs.readFileSync(process.env.PAYPAL_FIXTURE_FILE));
 if(String(url).endsWith('/oauth2/token'))return Response.json({access_token:'test-only-paypal-token',expires_in:300});
 if(String(url).includes('/billing/plans/'))return Response.json({status:'ACTIVE',billing_cycles:[{tenure_type:'REGULAR',frequency:{interval_unit:'MONTH',interval_count:1},pricing_scheme:{fixed_price:{value:'25.00',currency_code:'USD'}}}]});
 if(String(url).endsWith('/verify-webhook-signature'))return Response.json({verification_status:JSON.parse(options.body).transmission_sig==='valid'?'SUCCESS':'FAILURE'});
 if(options.method==='POST')return Response.json({id:'I-TESTAPP123',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/approval'}]});
 return Response.json({id:'I-TESTAPP123',plan_id:'P-EXAMPLE123',custom_id:fixture.application,status:fixture.status,billing_info:{last_payment:{amount:{value:'25.00',currency_code:'USD'},time:'2026-11-13T00:00:00Z'}}});
};

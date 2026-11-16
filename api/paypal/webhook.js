'use strict';
// This route is intentionally fail-closed until the persistent membership
// transaction and verified subscriber-to-applicant binding are deployed.
// It proves the Vercel serverless endpoint exists without granting access.
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST') {
    res.statusCode=405;
    res.setHeader('Allow','POST');
    return res.end(JSON.stringify({error:'Method not allowed'}));
  }
  res.statusCode=503;
  res.setHeader('Retry-After','3600');
  return res.end(JSON.stringify({
    error:'PayPal membership activation is not yet enabled: durable storage and authenticated account association required.'
  }));
};

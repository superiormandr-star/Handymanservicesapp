// Cloudflare Workers entry point for Superior ProConnect 2.0.
// Fail closed until the existing Node.js routes have been ported and tested.
// Never return fake success for job submissions, payments or membership activation.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      try {
        await env.DB.prepare('SELECT 1 AS ok').first();
        return Response.json({ok: true, platform: 'cloudflare-workers', database: 'connected',
          apiReady: false, paymentsReady: false, persistenceTestsPassed: false},
          {headers: {'cache-control':'no-store'}});
      } catch {
        return Response.json({ok: false, platform: 'cloudflare-workers', database: 'unavailable',
          apiReady: false, paymentsReady: false}, {status: 503});
      }
    }
    if (url.pathname.startsWith('/api/')) {
      return Response.json({error:'Cloudflare API migration in progress; submissions and payments disabled to protect records.'},
        {status:503, headers:{'cache-control':'no-store'}});
    }
    if (/^\/logos\/Superior_(?:ProConnect_Master|Construction_Network|Automotive_Network)\.jpg$/.test(url.pathname)) {\n      return env.ASSETS.fetch(request);\n    }\n    return env.ASSETS.fetch(request);
  }
};

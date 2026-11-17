export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/__migration/health') {
      return Response.json({ service: 'superior-proconnect', target: 'cloudflare', mode: 'migration-preview', paymentsReady: false, customerWritesReady: false }, { headers: { 'cache-control': 'no-store' } });
    }
    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'API not migrated. Production remains on the existing host.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    return env.ASSETS.fetch(request);
  }
};

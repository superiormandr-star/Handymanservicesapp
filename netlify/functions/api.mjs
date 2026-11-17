import { Readable } from 'node:stream';
import { getStore } from '@netlify/blobs';
import storage from '../../netlify-storage.js';

storage.configureNetlifyStore(getStore);

const hopByHop = new Set(['connection', 'transfer-encoding', 'content-length', 'keep-alive']);

export default async function handler(request, context) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) {
    return Response.json({error: 'Not found'}, {status: 404, headers: {'cache-control': 'no-store'}});
  }

  try {
    // Select durable storage even in local Functions emulation or a runtime
    // that omits Netlify's build-time NETLIFY variable.
    process.env.NETLIFY = 'true';
    const { default: dispatch } = await import('../../server.js');
    const incoming = request.body ? Readable.fromWeb(request.body) : Readable.from([]);
    incoming.method = request.method;
    incoming.url = url.pathname + url.search;
    incoming.headers = Object.fromEntries(request.headers);
    incoming.socket = {remoteAddress: context?.ip || 'unknown'};

    const headers = new Headers();
    const chunks = [];
    const outgoing = {
      statusCode: 200,
      setHeader(name, value) {
        if (!hopByHop.has(name.toLowerCase())) headers.set(name, String(value));
        return this;
      },
      getHeader(name) { return headers.get(name); },
      writeHead(code, values = {}) {
        this.statusCode = code;
        for (const [name, value] of Object.entries(values)) this.setHeader(name, value);
        return this;
      },
      write(chunk) {
        if (chunk !== undefined) chunks.push(Buffer.from(chunk));
        return true;
      },
      end(chunk) { this.write(chunk); },
    };

    await dispatch(incoming, outgoing);
    headers.set('cache-control', 'no-store');
    const noBody = request.method === 'HEAD' || [204, 205, 304].includes(outgoing.statusCode);
    return new Response(noBody ? null : Buffer.concat(chunks), {status: outgoing.statusCode, headers});
  } catch {
    return Response.json({error: 'The request could not be completed. No payment or record update was confirmed.'}, {
      status: 503, headers: {'cache-control': 'no-store'}
    });
  }
}

export const config = {path: '/api/*'};

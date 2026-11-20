'use strict';
async function readBytes(request, limit) {
  const length = request.headers?.['content-length'];
  let size = 0;
  const chunks = [];
  if (length !== undefined && Number(length) > limit) {
    request.resume?.();
    throw Object.assign(Error('Request too large'), {status: 413});
  }
  for await (const value of request) {
    const chunk = Buffer.from(value);
    size += chunk.length;
    if (size > limit) throw Object.assign(Error('Request too large'), {status: 413});
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

async function readJson(request, limit = 16 * 1024) {
  const bytes = await readBytes(request, limit);
  try {
    const input = JSON.parse(bytes.toString('utf8') || '{}');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Expected an object.');
    return input;
  } catch {
    throw Object.assign(Error('Invalid JSON'), {status: 400});
  }
}

module.exports = { readBytes, readJson };

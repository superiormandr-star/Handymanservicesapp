'use strict';
const { createHmac } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { encrypt, decrypt } = require('./record-envelope');
const { openNetlifyStore } = require('./netlify-storage');

const maxBytes = 768 * 1024;
const maxPhotos = 3;
const photoId = /^[a-f0-9]{64}$/;
const jobId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

function cleanJpeg(input) {
  const invalid = () => Object.assign(Error('Upload a valid JPEG photo.'), {status: 400});
  if (input.length < 8 || input.readUInt16BE(0) !== 0xffd8) throw invalid();
  const segments = [input.subarray(0, 2)];
  let dimensions = false;
  for (let index = 2; index + 4 < input.length;) {
    const marker = input[index + 1];
    if (input[index] !== 0xff) throw invalid();
    const length = input.readUInt16BE(index + 2);
    const end = index + 2 + length;
    if (length < 2 || end > input.length) throw invalid();
    if (marker === 0xc0) {
      if (length < 11 || input[index + 4] !== 8) throw invalid();
      const height = input.readUInt16BE(index + 5);
      const width = input.readUInt16BE(index + 7);
      if (!height || !width || height > 2048 || width > 2048) throw invalid();
      dimensions = true;
    }
    if (marker === 0xda) {
      if (!dimensions) throw invalid();
      for (let offset = end; offset < input.length - 1; offset++) {
        if (input[offset] !== 0xff) continue;
        const next = input[++offset];
        if (next === 0xd9 && offset === input.length - 1) {
          return Buffer.concat([...segments, input.subarray(index)]);
        }
        if (next !== 0 && (next < 0xd0 || next > 0xd7)) throw invalid();
      }
      throw invalid();
    }
    // Remove metadata such as EXIF/GPS, comments and embedded thumbnails.
    if (marker !== 0xfe && (marker < 0xe0 || marker > 0xef)) {
      if (![0xc0, 0xc4, 0xdb, 0xdd].includes(marker)) throw invalid();
      segments.push(input.subarray(index, end));
    }
    index = end;
  }
  throw invalid();
}

function photoObjectKey(job, photo) {
  if (!jobId.test(job) || !photoId.test(photo)) throw Error('Invalid photo identifier.');
  return 'photos/' + job + '/' + photo + '.jpg.enc';
}

function createJobPhotos({env = process.env, namespace, backend, getStore} = {}) {
  const secret = env.BACKUP_ENCRYPTION_KEY;
  const netlify = env.NETLIFY && backend === 'netlify';
  const local = !env.NETLIFY && !env.VERCEL && env.SPC_LOCAL_PHOTO_DIR;
  const enabled = Boolean(/^[a-f0-9]{64}$/i.test(secret || '') && (netlify || local));
  const localPath = key => path.join(local, ...key.split('/'));

  async function readObject(key) {
    if (netlify) return openNetlifyStore(getStore).get(namespace + '/' + key, {type: 'text'});
    try {
      return await fs.readFile(localPath(key), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  return {
    enabled,
    async put(job, input) {
      if (!enabled) throw Error('Private photo storage is unavailable.');
      if (input.length > maxBytes) throw Object.assign(Error('Photo is larger than 768 KB.'), {status: 413});
      const bytes = cleanJpeg(input);
      const id = createHmac('sha256', Buffer.from(secret, 'hex')).update(job).update(bytes).digest('hex');
      const key = photoObjectKey(job, id);
      const contents = encrypt(bytes, secret, key);
      if (netlify) {
        await openNetlifyStore(getStore).set(namespace + '/' + key, contents, {onlyIfNew: true});
      } else {
        const file = localPath(key);
        await fs.mkdir(path.dirname(file), {recursive: true, mode: 0o700});
        try {
          await fs.writeFile(file, contents, {mode: 0o600, flag: 'wx'});
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
        }
      }
      return {id, size: bytes.byteLength};
    },
    async get(job, photo) {
      if (!enabled) return null;
      const key = photoObjectKey(job, photo);
      const encrypted = await readObject(key);
      return encrypted ? decrypt(encrypted, secret, key) : null;
    }
  };
}

module.exports = { createJobPhotos, photoObjectKey, maxBytes, maxPhotos };

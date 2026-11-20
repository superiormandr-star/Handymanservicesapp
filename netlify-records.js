'use strict';
const { createHash } = require('node:crypto');
const { openRecordEnvelope, recordEnvelope, decrypt } = require('./record-envelope');
const { validateNamespace } = require('./netlify-storage');
const { photoObjectKey } = require('./job-photos');

const checksum = text => createHash('sha256').update(text).digest('hex');

function photoKeys(records) {
  const keys = new Set();
  for (const job of records.jobs || []) {
    for (const photo of job.photos || []) keys.add(photoObjectKey(job.id, photo.id));
  }
  return [...keys].sort();
}

function recordCounts(records) {
  const counts = Object.fromEntries(Object.entries(records)
    .filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length]));
  counts.bids = (records.jobs || []).reduce((total, job) => total + (job.bids || []).length, 0);
  counts.photos = photoKeys(records).length;
  return counts;
}

function verifyArchive(archive, secret) {
  const {v, state, photos} = archive || {};
  if (v !== 1 || typeof state?.ciphertext !== 'string' || state.sha256 !== checksum(state.ciphertext) ||
      !Array.isArray(photos)) throw Error('Invalid backup or state checksum.');
  const {records} = openRecordEnvelope(state.ciphertext, secret);
  const expected = photoKeys(records);
  const entries = new Map(photos.map(photo => [photo.key, photo]));
  if (photos.length !== expected.length || entries.size !== expected.length) throw Error('The backup photo inventory does not match.');
  for (const key of expected) {
    const photo = entries.get(key);
    if (typeof photo?.ciphertext !== 'string' || photo.sha256 !== checksum(photo.ciphertext)) {
      throw Error('A backup photo is missing or corrupt.');
    }
    decrypt(photo.ciphertext, secret, key);
  }
  return recordCounts(records);
}

function netlifyRecords(store, namespace, secret) {
  const prefix = validateNamespace(namespace) + '/';
  const stateKey = prefix + 'state.json.enc';
  const read = key => store.get(key, {type: 'text', consistency: 'strong'});

  async function backup() {
    const ciphertext = await read(stateKey);
    if (!ciphertext) throw Error('The namespace has no initialized records.');
    const {records} = openRecordEnvelope(ciphertext, secret);
    const photos = [];
    // Photo objects are immutable, so the committed state fixes the backup inventory.
    for (const key of photoKeys(records)) {
      const photo = await read(prefix + key);
      if (typeof photo !== 'string') throw Error('A committed private photo is missing.');
      photos.push({key, ciphertext: photo, sha256: checksum(photo)});
    }
    const archive = {v: 1, state: {ciphertext, sha256: checksum(ciphertext)}, photos};
    verifyArchive(archive, secret);
    return archive;
  }

  async function restore(archive) {
    const counts = verifyArchive(archive, secret);
    if (await read(stateKey) !== null) throw Error('The destination namespace already has records.');
    for (const photo of archive.photos) {
      const key = prefix + photo.key;
      const result = await store.set(key, photo.ciphertext, {onlyIfNew: true});
      if (!result.modified && await read(key) !== photo.ciphertext) {
        throw Error('A different private photo already exists in the destination.');
      }
    }
    const result = await store.set(stateKey, archive.state.ciphertext, {onlyIfNew: true});
    if (!result.modified) throw Error('The destination namespace was initialized by another operation.');
    const restored = await backup();
    if (restored.state.sha256 !== archive.state.sha256 ||
        restored.photos.some(photo => !archive.photos.some(entry => entry.key === photo.key && entry.sha256 === photo.sha256))) {
      throw Error('The restored namespace did not match the archive.');
    }
    return counts;
  }

  function init(records = {profiles: [], reviews: [], intake: [], documents: []}) {
    if (photoKeys(records).length) throw Error('Use an encrypted archive to initialize records with photos.');
    const ciphertext = recordEnvelope({records, oauth: {}}, secret);
    return restore({v: 1, state: {ciphertext, sha256: checksum(ciphertext)}, photos: []});
  }

  return {backup, restore, init};
}

module.exports = {netlifyRecords, verifyArchive, recordCounts};

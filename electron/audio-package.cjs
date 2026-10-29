'use strict';
// A bounded, uncompressed container. No archive entry is ever extracted to disk.
const { createHash } = require('node:crypto');
const MAGIC = Buffer.from('SQUIDPK1');
const MAX_AUDIO = 200 * 1024 * 1024;
const MAX_MANIFEST = 11 * 1024 * 1024;
const MAX_PACKAGE = 12 + MAX_MANIFEST + MAX_AUDIO;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const formats = { wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac' };
function audioInfo(name, bytes) {
  if (typeof name !== 'string' || name.length > 180 || !name || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name)) throw new Error('Audio needs a plain filename.');
  const ext = name.split('.').pop().toLowerCase(), type = formats[ext];
  if (!type || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_AUDIO) throw new Error('Choose WAV, MP3, OGG, M4A or FLAC audio up to 200 MiB.');
  const head = bytes.subarray(0, 12);
  const valid = ext === 'wav' ? head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WAVE'
    : ext === 'ogg' ? head.toString('ascii', 0, 4) === 'OggS'
    : ext === 'flac' ? head.toString('ascii', 0, 4) === 'fLaC'
    : ext === 'm4a' ? head.toString('ascii', 4, 8) === 'ftyp'
    : head.toString('ascii', 0, 3) === 'ID3' || head[0] === 255 && (head[1] & 224) === 224;
  if (!valid) throw new Error('The audio contents do not match its supported filename extension.');
  return { name, type, size: bytes.length, sha256: digest(bytes) };
}
function safeRelative(value) {
  if (typeof value !== 'string' || value.length > 1024 || !value || value.split('/').some(part => !part || part === '.' || part === '..' || /[<>:"\\|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('Audio references must stay inside the package folder, using portable relative paths.');
  return value;
}
function encodePackage(content, audio, mode, reference) {
  if (!['bundle', 'reference'].includes(mode)) throw new Error('Choose bundled audio or a relative reference.');
  const info = audioInfo(audio.name, audio.bytes);
  const manifest = { format: 'squidware-package', version: 1, project: JSON.parse(content), audio: { ...info, mode, ...(mode === 'reference' ? { path: safeRelative(reference) } : {}) } };
  const json = Buffer.from(JSON.stringify(manifest));
  if (json.length > MAX_MANIFEST) throw new Error('Package manifest is too large.');
  const header = Buffer.alloc(12); MAGIC.copy(header); header.writeUInt32LE(json.length, 8);
  return Buffer.concat([header, json, ...(mode === 'bundle' ? [audio.bytes] : [])]);
}
function decodePackage(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12 || bytes.length > MAX_PACKAGE || !bytes.subarray(0, 8).equals(MAGIC)) throw new Error('Invalid or oversized Squidware package.');
  const length = bytes.readUInt32LE(8);
  if (!length || length > MAX_MANIFEST || length > bytes.length - 12) throw new Error('Invalid package manifest size.');
  let manifest;
  try { manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(12, 12 + length))); } catch { throw new Error('Invalid package manifest JSON.'); }
  if (manifest?.format !== 'squidware-package' || manifest.version !== 1) throw new Error('Unsupported package manifest. Update Squidware to open this package.');
  const audio = manifest.audio;
  if (!audio || !['bundle', 'reference'].includes(audio.mode) || !Number.isSafeInteger(audio.size) || audio.size < 1 || audio.size > MAX_AUDIO || !/^[a-f0-9]{64}$/.test(audio.sha256) || typeof audio.name !== 'string' || audio.name.length > 180 || /[<>:"/\\|?*\x00-\x1f]/.test(audio.name) || !formats[audio.name.split('.').pop().toLowerCase()] || audio.type !== formats[audio.name.split('.').pop().toLowerCase()]) throw new Error('Invalid package audio manifest.');
  const payload = bytes.subarray(12 + length);
  if (audio.mode === 'reference') { safeRelative(audio.path); if (payload.length) throw new Error('Unexpected package payload.'); }
  else {
    if (audio.path !== undefined || payload.length !== audio.size || digest(payload) !== audio.sha256) throw new Error('Package audio size or checksum does not match.');
    audioInfo(audio.name, payload);
  }
  return { content: JSON.stringify(manifest.project), audio, bytes: payload };
}
module.exports = { MAX_AUDIO, MAX_PACKAGE, digest, audioInfo, safeRelative, encodePackage, decodePackage };

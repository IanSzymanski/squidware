'use strict';
// Bundles examples/tether-space-show.squid with the Space show recording into a portable .squidpack.
// Usage: node scripts/demo-show/package.cjs <recording.mp3> <output.squidpack>
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { encodePackage, decodePackage } = require('../../electron/audio-package.cjs');
const [audioPath, output] = process.argv.slice(2);
if (!audioPath || !output) throw new Error('Usage: node scripts/demo-show/package.cjs <recording.mp3> <output.squidpack>');
const content = fs.readFileSync(path.join(__dirname, '../../examples/tether-space-show.squid'), 'utf8');
const bytes = encodePackage(content, { name: 'tether-space-show.mp3', bytes: fs.readFileSync(audioPath) }, 'bundle');
const check = decodePackage(bytes);
assert.deepEqual(JSON.parse(check.content), JSON.parse(content), 'Package round trip changed the project.');
fs.writeFileSync(output, bytes);
console.log(`${output}: ${(bytes.length / 1048576).toFixed(1)} MiB, audio ${check.audio.name} sha256 ${check.audio.sha256}`);

/** Each desktop behavior has one owner. Unit/contract checks live in CI's fast job. */
export const desktopSuites = [
  { name: 'smoke', title: 'Sandbox and native bridge', timeoutMs: 60000 },
  { name: 'editor', title: 'Editing, file dialogs, drafts and undo', script: 'editor-qa.mjs', timeoutMs: 270000 },
  { name: 'accessibility', title: 'Keyboard navigation and rendered text', script: 'accessibility-qa.mjs', timeoutMs: 270000 },
  { name: 'field', title: 'Nearest selection, labels and display scale', script: 'field-presentation-qa.mjs', timeoutMs: 270000 },
  { name: 'formation-assignment', title: 'Positional assignment, paths, travel and acceptance', script: 'formation-assignment-qa.mjs', timeoutMs: 180000 },
  { name: 'cast', title: 'Docked Cast, shared selection and roster edits', script: 'cast-qa.mjs', timeoutMs: 210000 },
  { name: 'tooltips', title: 'Pointer/focus help and disabled reasons', script: 'tooltip-qa.mjs', timeoutMs: 180000 },
  { name: 'tooltips-fallback', title: 'Help after unavailable WebGL', script: 'tooltip-qa.mjs', args: ['--force-3d-fallback'], timeoutMs: 180000 },
  { name: 'preferences', title: 'Preferences across process restarts', script: 'preferences-qa.mjs', timeoutMs: 390000 },
  { name: 'thumbnails', title: 'Thumbnail invalidation and shared selection', script: 'thumbnail-qa.mjs', timeoutMs: 210000 },
  { name: 'playback', title: 'Clock, subscriptions and drag preview isolation', script: 'playback-qa.mjs', timeoutMs: 210000 },
  { name: 'recovery', title: 'Durable production recovery after restart', script: 'recovery-qa.mjs', timeoutMs: 330000 },
  { name: 'print', title: 'Native PDF output and pagination', script: 'print-regression-qa.mjs', timeoutMs: 270000 },
  { name: 'stage3d', title: 'WebGL lifecycle component harness (opt-in)', script: 'stage3d-qa.mjs', timeoutMs: 280000, optional: true },
];

export function selectSuites(argv) {
  if (argv.some(arg => ['--list', '--print-output'].includes(arg)) && argv.length !== 1) throw new Error('Use --list or --print-output alone.');
  const names = argv.filter(arg => arg.startsWith('--suite=')).flatMap(arg => arg.slice(8).split(','));
  const unknownFlags = argv.filter(arg => !arg.startsWith('--suite=') && !['--list', '--print-output'].includes(arg));
  if (unknownFlags.length) throw new Error(`Unknown arguments: ${unknownFlags.join(', ')}`);
  if (new Set(names).size !== names.length) throw new Error('Each suite may be selected only once.');
  for (const name of names) if (!desktopSuites.some(suite => suite.name === name)) throw new Error(`Unknown desktop suite: ${name}`);
  return names.length ? names.map(name => desktopSuites.find(suite => suite.name === name)) : desktopSuites.filter(suite => !suite.optional);
}

/** Independent suites continue after failure, so a report cannot imply unrun checks passed. */
export async function runChecks(checks, execute, onResult = async () => {}) {
  const results = [];
  for (const check of checks) {
    let result;
    try { result = await execute(check); }
    catch (error) { result = { status: 'error', error: error.message }; }
    results.push({ name: check.name, ...result });
    await onResult(results);
  }
  return results;
}

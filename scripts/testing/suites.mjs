/** Each desktop behavior has one owner. Unit/contract checks live in CI's fast job. */
export const desktopSuites = [
  { name: 'smoke', title: 'Sandbox and native bridge', timeoutMs: 60000 },
  { name: 'editor', title: 'Editing, file dialogs, drafts and undo', script: 'editor-qa.mjs', timeoutMs: 270000 },
  { name: 'accessibility', title: 'Keyboard navigation and rendered text', script: 'accessibility-qa.mjs', timeoutMs: 270000 },
  { name: 'field', title: 'Nearest selection, labels and display scale', script: 'field-presentation-qa.mjs', timeoutMs: 270000 },
  { name: 'formation-assignment', title: 'Positional assignment, paths, travel and acceptance', script: 'formation-assignment-qa.mjs', timeoutMs: 180000 },
  { name: 'spacing', title: 'Alignment, distribution, intervals and field guides', script: 'spacing-qa.mjs', timeoutMs: 210000 },
  { name: 'coordinate-entry', title: 'Drill phrases, exact group moves and acceptance', script: 'coordinate-entry-qa.mjs', timeoutMs: 270000 },
  { name: 'cast', title: 'Docked Cast, shared selection and roster edits', script: 'cast-qa.mjs', timeoutMs: 210000 },
  { name: 'selection', title: 'Additive sections, lasso, geometric review and saved groups', script: 'selection-qa.mjs', timeoutMs: 300000 },
  { name: 'workspace', title: 'Resizable panels, presets, focus and restored layouts', script: 'workspace-qa.mjs', timeoutMs: 240000 },
  { name: 'tooltips', title: 'Pointer/focus help and disabled reasons', script: 'tooltip-qa.mjs', timeoutMs: 180000 },
  { name: 'tooltips-fallback', title: 'Help after unavailable WebGL', script: 'tooltip-qa.mjs', args: ['--force-3d-fallback'], timeoutMs: 180000 },
  { name: 'themes', title: 'Themes, UI scaling, contrast and preserved project colors', script: 'themes-qa.mjs', timeoutMs: 450000 },
  { name: 'commands', title: 'Command search, drill phrases and persistent shortcut bindings', script: 'commands-qa.mjs', timeoutMs: 240000 },
  { name: 'preferences', title: 'Preferences across process restarts', script: 'preferences-qa.mjs', timeoutMs: 390000 },
  { name: 'thumbnails', title: 'Thumbnail invalidation and shared selection', script: 'thumbnail-qa.mjs', timeoutMs: 210000 },
  { name: 'playback', title: 'Clock, subscriptions and drag preview isolation', script: 'playback-qa.mjs', timeoutMs: 210000 },
  { name: 'audio-clock', title: 'Media clock, offset, loops and silent fallback', script: 'audio-clock-qa.mjs', timeoutMs: 210000 },
  { name: 'timeline', title: 'Count viewport, 128-set navigation and stepping', script: 'timeline-qa.mjs', timeoutMs: 210000 },
  { name: 'rehearsal', title: 'Annotated bookmarks, saved ranges, focus and shared-clock loops', script: 'rehearsal-qa.mjs', timeoutMs: 240000 },
  { name: 'set-creation', title: 'Distinct new, duplicate, insert-before and hold actions', script: 'set-creation-qa.mjs', timeoutMs: 210000 },
  { name: 'analysis-rules', title: 'Portable section/direction rules, declarations and worker invalidation', script: 'analysis-rules-qa.mjs', timeoutMs: 240000 },
  { name: 'analysis', title: 'Background checks, incremental edits and worker recovery', script: 'analysis-qa.mjs', timeoutMs: 210000 },
  { name: 'recovery', title: 'Durable production recovery after restart', script: 'recovery-qa.mjs', timeoutMs: 330000 },
  { name: 'print', title: 'Native PDF output and pagination', script: 'print-regression-qa.mjs', timeoutMs: 270000 },
  { name: 'stage3d', title: 'WebGL lifecycle component harness (opt-in)', script: 'stage3d-qa.mjs', timeoutMs: 280000, optional: true },
];

export function selectSuites(argv) {
  if (argv.some(arg => ['--list', '--print-output'].includes(arg)) && argv.length !== 1) throw new Error('Use --list or --print-output alone.');
  const names = argv.filter(arg => arg.startsWith('--suite=')).flatMap(arg => arg.slice(8).split(','));
  const unknownFlags = argv.filter(arg => !arg.startsWith('--suite=') && !arg.startsWith('--jobs=') && !['--list', '--print-output'].includes(arg));
  if (unknownFlags.length) throw new Error(`Unknown arguments: ${unknownFlags.join(', ')}`);
  desktopConcurrency(argv);
  if (new Set(names).size !== names.length) throw new Error('Each suite may be selected only once.');
  for (const name of names) if (!desktopSuites.some(suite => suite.name === name)) throw new Error(`Unknown desktop suite: ${name}`);
  return names.length ? names.map(name => desktopSuites.find(suite => suite.name === name)) : desktopSuites.filter(suite => !suite.optional);
}

export function desktopConcurrency(argv) {
  const options = argv.filter(arg => arg.startsWith('--jobs='));
  if (options.length > 1 || options.some(arg => !/^--jobs=[1-4]$/.test(arg))) throw new Error('Use one --jobs=1, --jobs=2, --jobs=3 or --jobs=4 option.');
  return options.length ? Number(options[0].slice(7)) : 1;
}

/** Independent suites continue after failure, so a report cannot imply unrun checks passed. */
export async function runChecks(checks, execute, onResult = async () => {}, { concurrency = 1 } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error('Suite concurrency must be an integer from 1 to 4.');
  const results = new Array(checks.length);
  let next = 0;
  let reporting = Promise.resolve();
  async function worker() {
    while (next < checks.length) {
      const index = next++;
      const check = checks[index];
      let result;
      try { result = await execute(check); }
      catch (error) { result = { status: 'error', error: error.message }; }
      results[index] = { name: check.name, ...result };
      // Concurrent workers keep the selected order and serialize report writes.
      const snapshot = results.filter(Boolean);
      reporting = reporting.then(() => onResult(snapshot));
      await reporting;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, checks.length) }, worker));
  return results;
}

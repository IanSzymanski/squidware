export function certificationLayer(argv) {
  const layer = argv.find(arg => arg.startsWith('--layer='))?.slice(8) ?? 'all';
  if (!['all', 'source', 'desktop'].includes(layer) || argv.some(arg => !['--layer=all', '--layer=source', '--layer=desktop', '--configure-sandbox'].includes(arg)) || new Set(argv).size !== argv.length || argv.filter(arg => arg.startsWith('--layer=')).length > 1) {
    throw new Error('Use pnpm certify [--layer=source|desktop] [--configure-sandbox].');
  }
  return layer;
}

// Local and hosted runs execute this same plan; OS setup is explicitly recorded.
export function certificationPlan(layer, { platform = process.platform, configureSandbox = false } = {}) {
  const steps = [{ name: 'install', tool: 'pnpm', args: ['install', '--frozen-lockfile'] }];
  if (layer !== 'desktop') steps.push(
    { name: 'source', tool: 'pnpm', args: ['test'] },
    { name: 'contracts', tool: 'pnpm', args: ['test:contracts'] },
  );
  if (layer === 'source') return steps;
  steps.push(
    { name: 'electron-install', tool: 'pnpm', args: ['exec', 'install-electron'] },
    { name: 'python-version', tool: 'python', args: ['--version'] },
    { name: 'print-dependencies', tool: 'python', args: ['-m', 'pip', 'install', '-r', 'scripts/print-requirements.txt'] },
    { name: 'build', tool: 'pnpm', args: ['build'] },
    { name: 'native', tool: 'pnpm', args: ['test:native'] },
  );
  const sandbox = file => [
    { name: file.startsWith('release') ? 'package-sandbox-owner' : 'sandbox-owner', tool: 'sudo', args: ['chown', 'root:root', file] },
    { name: file.startsWith('release') ? 'package-sandbox-mode' : 'sandbox-mode', tool: 'sudo', args: ['chmod', '4755', file] },
  ];
  if (platform === 'linux' && configureSandbox) steps.push(...sandbox('node_modules/electron/dist/chrome-sandbox'));
  steps.push(
    // macOS suites share one native desktop and audio output. Concurrent visible
    // Electron apps compete for activation and can stall playback clocks.
    { name: 'workflows', tool: 'node', args: ['scripts/run-desktop-regressions.mjs', platform === 'darwin' ? '--jobs=1' : '--jobs=2'], display: true },
    { name: 'pdf-inspection', tool: 'python', args: ['scripts/verify-print.py'], printOutput: true },
    { name: 'package', tool: 'pnpm', args: ['exec', 'electron-builder', '--dir', '--publish', 'never'] },
  );
  if (platform === 'linux' && configureSandbox) steps.push(...sandbox('release/linux-unpacked/chrome-sandbox'));
  steps.push({ name: 'packaged-startup', tool: 'node', args: ['scripts/packaged-smoke.mjs'], display: true });
  return steps;
}

export function successfulPrintOutput(report, sourceHash) {
  const print = report.checks?.find(check => check.name === 'print');
  if (report.state !== 'completed' || report.source?.contentHash !== sourceHash || print?.status !== 'passed' || !print.output) {
    throw new Error('No successful print output for this source and workflow run.');
  }
  return print.output;
}

import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { root } from './testing/launcher.mjs';
import { runProcess } from './testing/process.mjs';
import { desktopSuites, selectSuites, desktopConcurrency, runChecks } from './testing/suites.mjs';
import { runtimeIdentity, sourceIdentity, verifyBuild } from './testing/provenance.mjs';
import { successfulPrintOutput } from './testing/certification.mjs';

const argv = process.argv.slice(2);
const selected = selectSuites(argv);
const concurrency = desktopConcurrency(argv);
const reportFile = path.join(root, '.qa/desktop-matrix/results.json');
if (argv.includes('--list')) {
  for (const suite of desktopSuites) console.log(`${suite.name}: ${suite.title}`);
} else if (argv.includes('--print-output')) {
  const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
  const source = await sourceIdentity(root);
  await verifyBuild(root, source);
  console.log(successfulPrintOutput(report, source.contentHash));
} else {
  const require = createRequire(import.meta.url);
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const outputRoot = path.join(root, '.qa/desktop-matrix', runId);
  await fs.mkdir(outputRoot, { recursive: true });
  const report = { runId, state: 'running', concurrency, platform: process.platform, node: process.versions.node, runtime: runtimeIdentity(),
    source: await sourceIdentity(root), scope: selected.length === desktopSuites.filter(suite => !suite.optional).length && selected.every(suite => !suite.optional) ? 'full-desktop' : 'targeted',
    selected: selected.map(suite => suite.name), checks: [] };
  const save = async () => {
    const data = JSON.stringify(report, null, 2);
    await fs.writeFile(path.join(outputRoot, 'results.json'), data);
    const temporary = `${reportFile}.${runId}.tmp`;
    await fs.writeFile(temporary, data); await fs.rename(temporary, reportFile);
  };
  await save();
  try { report.build = await verifyBuild(root, report.source); }
  catch (error) { report.state = 'preflight_failed'; report.error = error.message; await save(); throw error; }
  report.checks = await runChecks(selected, async suite => {
    console.log(`\nRUN ${suite.name}: ${suite.title}`);
    const output = path.join(outputRoot, suite.name);
    const command = suite.script ? process.execPath : require('electron');
    const args = suite.script ? [path.join(root, 'scripts', suite.script), `--output=${output}`, ...(suite.args ?? [])] : [root, '--smoke-test'];
    const result = await runProcess(command, args, { cwd: root, timeoutMs: suite.timeoutMs, logFile: path.join(outputRoot, `${suite.name}.log`), live: concurrency === 1 });
    if (concurrency > 1 && result.status !== 'passed') console.error(await fs.readFile(result.logFile, 'utf8').catch(error => `Could not read ${suite.name} log: ${error.message}`));
    console.log(`${suite.name}: ${result.status} (${(result.elapsedMs / 1000).toFixed(1)}s)`);
    return { ...result, output };
  }, async checks => { report.checks = [...checks]; await save(); }, { concurrency });
  try {
    const after = await sourceIdentity(root);
    if (after.contentHash !== report.source.contentHash) throw new Error('Source changed during desktop tests. Rebuild and rerun.');
    await verifyBuild(root, after);
  } catch (error) { report.state = 'postflight_failed'; report.error = error.message; await save(); throw error; }
  report.state = 'completed'; await save();
  const failures = report.checks.filter(check => check.status !== 'passed');
  console.log(`\n${report.checks.length - failures.length}/${report.checks.length} desktop suites passed. Report: ${reportFile}`);
  if (failures.length) process.exitCode = 1;
}

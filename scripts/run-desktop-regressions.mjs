import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { root } from './testing/launcher.mjs';
import { runProcess } from './testing/process.mjs';
import { desktopSuites, selectSuites, runChecks } from './testing/suites.mjs';

const argv = process.argv.slice(2);
const selected = selectSuites(argv);
const reportFile = path.join(root, '.qa/desktop-matrix/results.json');
if (argv.includes('--list')) {
  for (const suite of desktopSuites) console.log(`${suite.name}: ${suite.title}`);
} else if (argv.includes('--print-output')) {
  const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
  const print = report.checks.find(check => check.name === 'print');
  if (report.state !== 'completed' || print?.status !== 'passed') throw new Error('This run has no successful print suite.');
  console.log(print.output);
} else {
  const require = createRequire(import.meta.url);
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const outputRoot = path.join(root, '.qa/desktop-matrix', runId);
  await fs.mkdir(outputRoot, { recursive: true });
  const report = { runId, state: 'running', platform: process.platform, node: process.versions.node, selected: selected.map(suite => suite.name), checks: [] };
  const save = async () => {
    const data = JSON.stringify(report, null, 2);
    await fs.writeFile(path.join(outputRoot, 'results.json'), data);
    const temporary = `${reportFile}.${runId}.tmp`;
    await fs.writeFile(temporary, data); await fs.rename(temporary, reportFile);
  };
  await save();
  report.checks = await runChecks(selected, async suite => {
    console.log(`\nRUN ${suite.name}: ${suite.title}`);
    const output = path.join(outputRoot, suite.name);
    const command = suite.script ? process.execPath : require('electron');
    const args = suite.script ? [path.join(root, 'scripts', suite.script), `--output=${output}`, ...(suite.args ?? [])] : [root, '--smoke-test'];
    const result = await runProcess(command, args, { cwd: root, timeoutMs: suite.timeoutMs, logFile: path.join(outputRoot, `${suite.name}.log`) });
    console.log(`${suite.name}: ${result.status} (${(result.elapsedMs / 1000).toFixed(1)}s)`);
    return { ...result, output };
  }, async checks => { report.checks = [...checks]; await save(); });
  report.state = 'completed'; await save();
  const failures = report.checks.filter(check => check.status !== 'passed');
  console.log(`\n${report.checks.length - failures.length}/${report.checks.length} desktop suites passed. Report: ${reportFile}`);
  if (failures.length) process.exitCode = 1;
}

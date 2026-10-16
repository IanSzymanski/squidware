import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { root } from './testing/launcher.mjs';
import { requireProcess } from './testing/process.mjs';
import { pnpmCommand } from './testing/pnpm.mjs';
import { runtimeIdentity, sourceIdentity, verifyBuild } from './testing/provenance.mjs';
import { certificationLayer, certificationPlan, successfulPrintOutput } from './testing/certification.mjs';

const argv = process.argv.slice(2);
const layer = certificationLayer(argv);
const plan = certificationPlan(layer, { configureSandbox: argv.includes('--configure-sandbox') });
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const output = path.join(root, '.qa/certification', runId);
await fs.mkdir(output, { recursive: true });
const report = { runId, layer, state: 'running', source: await sourceIdentity(root), runtime: runtimeIdentity(), steps: plan.map(step => ({ name: step.name, status: 'not_run' })) };
const save = () => fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
await save();
try {
  for (const [index, step] of plan.entries()) {
    let invocation = step.tool === 'pnpm' ? pnpmCommand(step.args) : { command: step.tool === 'node' ? process.execPath : step.tool === 'python' ? process.env.SQUIDWARE_PYTHON || 'python' : step.tool, args: [...step.args] };
    if (step.printOutput) {
      const workflows = JSON.parse(await fs.readFile(path.join(root, '.qa/desktop-matrix/results.json'), 'utf8'));
      invocation.args.push(successfulPrintOutput(workflows, report.source.contentHash));
      report.workflowRun = workflows.runId;
    }
    if (step.display && process.platform === 'linux') invocation = { command: 'xvfb-run', args: ['--auto-servernum', invocation.command, ...invocation.args] };
    console.log(`\nCERTIFY ${layer}: ${step.name}`);
    report.steps[index].status = 'running'; await save();
    try {
      const result = await requireProcess(invocation.command, invocation.args, { cwd: root, timeoutMs: 900000, logFile: path.join(output, `${step.name}.log`), env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } });
      report.steps[index] = { name: step.name, ...result };
    } catch (error) { report.steps[index] = { name: step.name, status: 'failed', error: error.message }; throw error; }
    await save();
  }
  const after = await sourceIdentity(root);
  if (after.contentHash !== report.source.contentHash) throw new Error('Source changed during certification. Run certification again on the intended source.');
  if (layer !== 'source') report.build = await verifyBuild(root, after);
  report.state = 'passed';
} catch (error) {
  report.state = 'failed'; report.error = error.message; process.exitCode = 1;
  console.error(error.message);
} finally {
  await save();
  console.log(`Certification ${report.state} (${layer}, ${report.source.revision}${report.source.dirty ? ', dirty' : ''}). Report: ${path.join(output, 'results.json')}`);
}

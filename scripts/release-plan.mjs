import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function validatePlan(plan) {
  if (plan.schemaVersion !== 1 || !/^[\w.-]+\/[\w.-]+$/.test(plan.repository)) throw new Error('Invalid release plan.');
  const assigned = new Map(); let previous = -1;
  for (const [index, release] of plan.releases.entries()) {
    if (!/^\d+\.\d+\.\d+$/.test(release.version) || release.issues.length === 0) throw new Error('Each release needs a version and issues.');
    const [major, minor, patch] = release.version.split('.').map(Number);
    const order = major * 1000000 + minor * 1000 + patch;
    if (order <= previous) throw new Error('Release versions must increase.'); previous = order;
    for (const id of release.issues) {
      if (!Number.isInteger(id) || id < 1 || assigned.has(id) || id === plan.trackerIssue) throw new Error(`Duplicate or invalid issue #${id}.`);
      assigned.set(id, index);
    }
  }
  for (const [id, dependencies] of Object.entries(plan.dependencies)) for (const dependency of dependencies) {
    if (assigned.has(Number(id)) && assigned.has(dependency) && assigned.get(dependency) > assigned.get(Number(id))) throw new Error(`#${id} depends on later-release #${dependency}.`);
  }
  const visited = new Set(), visiting = new Set();
  const visit = id => { if (visiting.has(id)) throw new Error(`Dependency cycle at #${id}.`); if (visited.has(id)) return; visiting.add(id); (plan.dependencies[id] || []).forEach(visit); visiting.delete(id); visited.add(id); };
  for (const id of assigned.keys()) visit(id);
  return assigned;
}

export function issueMetadata(issue) {
  const body = issue.body || '';
  const priority = body.match(/\*\*Priority:\*\*\s*(P[0-3])/)?.[1] || issue.priority || 'P2';
  const effort = body.match(/\*\*Estimated (?:token effort|effort):\*\*\s*(XL|L|M|S)\b/)?.[1] || issue.effort || 'M';
  const importance = Number(body.match(/\*\*Importance:\*\*\s*([1-5])\/5/)?.[1] || issue.importance || 3);
  return { priority, effort, importance };
}

export function implementationOrder(plan, issues) {
  const mapping = validatePlan(plan), byId = new Map(issues.map(issue => [issue.number, issue]));
  const open = new Set(issues.filter(issue => issue.state === 'open' && mapping.has(issue.number)).map(issue => issue.number));
  const dependents = id => [...open].filter(other => (plan.dependencies[other] || []).includes(id)).length;
  const done = new Set(issues.filter(issue => issue.state === 'closed' && issue.state_reason === 'completed').map(issue => issue.number));
  const result = [], weights = { S: 1, M: 2, L: 4, XL: 8 }, foundation = [5, 6, 7, 38];
  for (const release of plan.releases) {
    const remaining = new Set(release.issues.filter(id => open.has(id)));
    while (remaining.size) {
      const eligible = [...remaining].filter(id => (plan.dependencies[id] || []).every(dep => done.has(dep)));
      if (!eligible.length) throw new Error(`Unfulfilled prerequisites for ${release.milestone}: ${[...remaining].join(', ')}.`);
      eligible.sort((a, b) => {
        const fa = foundation.indexOf(a), fb = foundation.indexOf(b);
        if (fa >= 0 || fb >= 0) return (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb);
        const ma = issueMetadata(byId.get(a)), mb = issueMetadata(byId.get(b));
        const score = (id, meta) => (3 * meta.importance + Math.min(dependents(id), 5)) / weights[meta.effort];
        return ma.priority.localeCompare(mb.priority) || score(b, mb) - score(a, ma) || a - b;
      });
      const id = eligible[0]; result.push({ ...byId.get(id), ...issueMetadata(byId.get(id)), release: release.milestone, dependents: dependents(id) });
      remaining.delete(id); done.add(id);
    }
  }
  return result;
}

export function releaseReady(plan, release, issues, publishedVersions) {
  const index = plan.releases.indexOf(release), byId = new Map(issues.map(issue => [issue.number, issue]));
  if (index < 0 || plan.releases.slice(0, index).some(previous => !publishedVersions.has(previous.version) || previous.issues.some(id => byId.get(id)?.state !== 'closed' || byId.get(id)?.state_reason !== 'completed'))) return false;
  return release.issues.every(id => byId.get(id)?.state === 'closed' && byId.get(id)?.state_reason === 'completed');
}

const link = issue => `[#${issue.number} · ${issue.title.replace(/[\[\]]/g, '')}](https://github.com/IanSzymanski/squidware/issues/${issue.number})`;
export function documents(plan, issues) {
  const order = implementationOrder(plan, issues), byId = new Map(issues.map(issue => [issue.number, issue]));
  const ranges = { S: '10k–30k', M: '30k–75k', L: '75k–150k', XL: '150k–300k+' };
  const releases = '# Squidware release plan\n\nReleases progress in order from v0.5 through v1.2. GitHub milestones own live scope/status; [release-plan.json](../release-plan.json) owns membership and hard prerequisites. Versions and grouping are planning decisions, not delivery dates. Issue acceptance criteria use automated/software-host evidence under the 2026-10-22 maintainer validation policy; human review and physical-hardware qualification are not gates.\n\n' + plan.releases.map(release => {
    const completed = release.issues.filter(id => byId.get(id)?.state === 'closed' && byId.get(id)?.state_reason === 'completed').length;
    return `## ${release.milestone} — ${release.name}\n\n${release.description}\n\n${completed}/${release.issues.length} implementation issues completed at reconciliation.\n\n` + release.issues.map(id => `- [${byId.get(id)?.state === 'closed' && byId.get(id)?.state_reason === 'completed' ? 'x' : ' '}] ${link(byId.get(id))}`).join('\n');
  }).join('\n\n') + `\n\nTracker #${plan.trackerIssue} spans all releases and belongs to the last milestone; it closes only after every child issue is fulfilled. New scope must be assigned in the plan before a release can publish. No issue is closed merely by assigning a milestone.\n\n## Publication\n\nThe release coordinator creates/synchronizes milestones and reconciles issue ranks. It considers only the first unpublished release, requires every planned issue to be closed as completed and no open milestone items, and requires successful CI on the exact source commit. It then builds and verifies Windows, macOS and Linux packages. Only successful builds can create a version commit/tag and publish a GitHub release with packages, checksums and issue-based notes. Existing published releases and tags are never overwritten. Pre-1.0 releases are marked prerelease. Release commits record the packaged version; normal development remains on main.\n\nPublication is rechecked against live issue state immediately before it becomes public. A failure keeps the release unpublished. Scheduled reconciliation retries interrupted work without treating cancelled/not-planned issues as fulfilled. Human review and physical-hardware qualification are not release gates under the [2026-10-22 validation policy](VALIDATION_POLICY.md). Automated acceptance, exact-source cross-platform CI, package verification and signing requirements in #72 remain in force; waived checks are not recorded as passed.\n`;
  const queue = '# Squidware implementation queue\n\nThe maintained queue now follows the [release plan](RELEASES.md). Work proceeds through the earliest unpublished milestone. Within each release, hard prerequisites come first; #5 → #6 → #7 → #38 is the explicit foundation sequence. Other eligible items sort by priority and `(3 × importance + min(open direct dependents, 5)) / effort weight`, then issue number. S/M/L/XL weights are 1/2/4/8. Token ranges remain low-confidence remaining input/output planning estimates, not measured usage or deadlines.\n\nGitHub Issues retain scope and acceptance evidence. Closed work leaves this active queue. The maintainer removed human review and physical-hardware qualification gates on 2026-10-22. #3 records delivered local performance evidence; #64 reviews automated platform/coverage evidence. See [validation policy](VALIDATION_POLICY.md). Existing priority labels and estimates are preserved unless scope/evidence changes.\n\n' + `${order.length} open implementation issues.\n\n| Order | Release | Issue | Priority | Importance | Remaining tokens | Hard prerequisites |\n| --- | --- | --- | --- | --- | --- | --- |\n` + order.map((issue, index) => `| ${index + 1} | ${issue.release} | ${link(issue)} | ${issue.priority} | ${issue.importance}/5 | ${issue.effort}: ${ranges[issue.effort]} | ${(plan.dependencies[issue.number] || []).map(id => `[#${id}](https://github.com/IanSzymanski/squidware/issues/${id})`).join(', ') || 'None'} |`).join('\n') + '\n\n## Maintenance\n\nUpdate release-plan.json when membership or prerequisites change; do not move an issue ahead of an unfinished prerequisite in a later release. The coordinator refreshes milestones, maintained rank blocks and tracker progress from live issue state. Close an issue only with acceptance evidence or an explicit maintainer decision; partial delivery, passing unit tests and PR titles do not establish completion. New issues require release assignment. Reconcile before publishing.\n';
  return { releases, queue, order };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plan = JSON.parse(await readFile('release-plan.json', 'utf8'));
  const issues = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const result = documents(plan, issues);
  await writeFile('docs/RELEASES.md', result.releases); await writeFile('docs/IMPLEMENTATION_QUEUE.md', result.queue);
  console.log(`Organized ${issues.length} issues; ${result.order.length} open implementation tasks.`);
}

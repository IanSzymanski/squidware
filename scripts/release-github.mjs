import { readFile, appendFile } from 'node:fs/promises';
import { validatePlan, implementationOrder, releaseReady } from './release-plan.mjs';
export async function github(path, method = 'GET', body) {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !process.env.GH_TOKEN) throw new Error('GitHub Actions repository and token are required.');
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, { method, headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) { const error = new Error(`${method} ${path}: ${response.status} ${result?.message || 'GitHub request failed'}`); error.status = response.status; throw error; }
  return result;
}
export async function pages(path) {
  const items = [];
  for (let page = 1; page <= 100; page++) { const batch = await github(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`); items.push(...batch); if (batch.length < 100) return items; }
  throw new Error('GitHub pagination exceeded its limit.');
}
export async function inventory() { return (await pages('issues?state=all&sort=created&direction=asc')).filter(issue => !issue.pull_request); }
export async function published() { return new Set((await pages('releases')).filter(release => !release.draft).map(release => release.tag_name.replace(/^v/, ''))); }
export async function loadPlan() { const plan = JSON.parse(await readFile('release-plan.json', 'utf8')); validatePlan(plan); if (plan.repository !== process.env.GITHUB_REPOSITORY) throw new Error('Release plan repository mismatch.'); return plan; }
export async function requireReady(plan, release, milestone) {
  const issues = await inventory();
  if (!releaseReady(plan, release, issues, await published())) throw new Error(`${release.milestone} is not fulfilled or a prior release is unpublished.`);
  const membership = new Set(plan.releases.flatMap(item => item.issues));
  if (issues.some(issue => issue.number !== plan.trackerIssue && !membership.has(issue.number) && issue.state === 'open')) throw new Error('Unassigned open issues need release planning.');
  const items = await pages(`issues?state=all&milestone=${milestone}`);
  if (items.some(issue => issue.state === 'open' || (!issue.pull_request && issue.state_reason !== 'completed'))) throw new Error('Milestone has unfulfilled items.');
  return issues;
}
const start = '<!-- squidware-release:start -->', end = '<!-- squidware-release:end -->';
function releaseBlock(body, text) { const original = (body || '').replace(/<!-- squidware-release:start -->[\s\S]*?<!-- squidware-release:end -->\s*/g, ''); return `${original.trim()}\n\n${start}\n${text}\n${end}\n`; }

if (process.argv[2] === 'coordinate') {
  const plan = await loadPlan(), issues = await inventory(), milestones = await pages('milestones?state=all');
  const byId = new Map(issues.map(issue => [issue.number, issue]));
  const order = implementationOrder(plan, issues), ranks = new Map(order.map((issue, index) => [issue.number, index + 1]));
  const known = new Set(plan.releases.flatMap(release => release.issues));
  const unknown = issues.filter(issue => issue.state === 'open' && issue.number !== plan.trackerIssue && !known.has(issue.number));
  let changes = 0;
  for (const release of plan.releases) {
    let milestone = milestones.find(item => item.title === release.milestone);
    if (!milestone) { milestone = await github('milestones', 'POST', { title: release.milestone, description: `${release.name}. ${release.description}\nManaged by release-plan.json. Publish only after every issue is fulfilled and package checks pass.` }); milestones.push(milestone); }
    // Retire the superseded human/hardware gate wording in the managed v1.0 description.
    const retiredValidation = 'representative hardware acceptance and actual writer/platform validation';
    if (milestone.description?.includes('Managed by release-plan.json.') && milestone.description.includes(retiredValidation)) {
      const description = milestone.description.replace(retiredValidation, 'measured software-host performance and automated platform validation');
      const updated = await github(`milestones/${milestone.number}`, 'PATCH', { description });
      if (updated.description !== description) throw new Error(`Milestone description read-back mismatch for ${release.milestone}.`);
      milestone.description = description; changes++;
    }
    for (const id of release.issues) {
      const snapshot = byId.get(id); if (!snapshot) throw new Error(`Planned issue #${id} does not exist.`);
      const issue = await github(`issues/${id}`);
      if (issue.state !== snapshot.state || issue.state_reason !== snapshot.state_reason) throw new Error(`Issue #${id} changed state during coordination; retry with a fresh inventory.`);
      let body = issue.body || '';
      if (ranks.has(id)) body = body.replace(/(\*\*Implementation order:\*\* )#[^\n]+/, `$1#${String(ranks.get(id)).padStart(2, '0')} of ${order.length} open implementation items`).replace(/(\*\*Open direct dependents:\*\* )\d+/, `$1${order.find(item => item.number === id).dependents}`);
      else if (issue.state === 'closed' && issue.state_reason === 'completed') body = body.replace(/(\*\*Implementation order:\*\* )[^\n]+/, '$1Completed; no active rank.').replace(/(\*\*Estimated token effort:\*\* )[^\n]+/, '$10 remaining (completed).');
      body = releaseBlock(body, `**Planned release:** ${release.milestone} — ${release.name}\n${ranks.has(id) ? `**Active implementation rank:** ${ranks.get(id)} of ${order.length}.` : '**Implementation:** completed; no remaining active rank.'}\nRelease membership retains automated acceptance criteria. Human review and physical-hardware qualification are not required under the [2026-10-22 validation policy](https://github.com/${plan.repository}/blob/main/docs/VALIDATION_POLICY.md). See [release plan](https://github.com/${plan.repository}/blob/main/docs/RELEASES.md).`);
      if (issue.milestone?.number !== milestone.number || issue.body !== body) {
        const updated = await github(`issues/${id}`, 'PATCH', { milestone: milestone.number, body });
        if (updated.milestone?.number !== milestone.number || updated.body !== body) throw new Error(`Read-back mismatch for #${id}.`); changes++;
      }
    }
    console.log(`${release.milestone}: ${release.issues.length} implementation issues assigned.`);
  }
  const last = milestones.find(item => item.title === plan.releases.at(-1).milestone), tracker = await github(`issues/${plan.trackerIssue}`);
  const complete = plan.releases.flatMap(release => release.issues).every(id => byId.get(id)?.state === 'closed' && byId.get(id)?.state_reason === 'completed');
  let trackerBody = tracker.body.split('## Completed foundations')[0].replace(/\*\*Ranked queue baseline[^\n]+\n/, '').trim();
  trackerBody = releaseBlock(trackerBody, '## Release progress\n\n' + plan.releases.map(release => `- **${release.milestone} — ${release.name}:** ${release.issues.filter(id => byId.get(id)?.state === 'closed' && byId.get(id)?.state_reason === 'completed').length}/${release.issues.length} complete. ` + release.issues.map(id => `[#${id}](https://github.com/${plan.repository}/issues/${id})`).join(', ')).join('\n') + `\n\n${order.length} open implementation tasks. The current ranks and prerequisites are in [the maintained queue](https://github.com/${plan.repository}/blob/main/docs/IMPLEMENTATION_QUEUE.md). This tracker closes only after every child is fulfilled; release publication also requires successful builds.`);
  if (tracker.milestone?.number !== last.number || tracker.body !== trackerBody || complete && tracker.state === 'open') await github(`issues/${tracker.number}`, 'PATCH', { milestone: last.number, body: trackerBody, ...(complete ? { state: 'closed', state_reason: 'completed' } : {}) });
  const releases = await published(), candidate = plan.releases.find(release => !releases.has(release.version));
  let ready = false, source = '', milestone = '';
  if (candidate && !unknown.length) {
    try {
      milestone = milestones.find(item => item.title === candidate.milestone).number;
      await requireReady(plan, candidate, milestone);
      source = (await github('git/ref/heads/main')).object.sha;
      const runs = await github(`actions/workflows/ci.yml/runs?event=push&branch=main&head_sha=${source}&per_page=10`);
      const latest = runs.workflow_runs.find(run => run.head_sha === source);
      ready = latest?.status === 'completed' && latest.conclusion === 'success';
    } catch (error) { console.log(`Awaiting fulfillment: ${error.message}`); }
  }
  const output = `ready=${ready}\nversion=${ready ? candidate.version : ''}\nsource_sha=${ready ? source : ''}\nmilestone=${ready ? milestone : ''}\n`;
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, output);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `Synchronized ${plan.releases.length} milestones and ${changes} issues. ${order.length} implementation tasks remain.\n\nNext release: ${candidate?.milestone || 'all published'}. Ready to package: ${ready}.\n${unknown.length ? `Unassigned open issues: ${unknown.map(issue => '#' + issue.number).join(', ')}.` : ''}\n`);
  console.log(output.trim());
}

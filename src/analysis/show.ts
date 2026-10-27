import { AnalysisClient, type AnalysisState, type AnalysisWorker } from './client';
import { transitionInput } from './input';
import type { AnalysisInput, AnalysisResult } from './input';
import type { Point, Project, TransitionIssue } from '../types';
import type { EditorStore } from '../editor/store';

export interface MoveCheck {
  index: number; moveId: string; signature: unknown[];
  status: 'pending' | 'ready' | 'error'; issues: TransitionIssue[]; error?: string;
}
export interface Finding { moveId: string; index: number; issue: TransitionIssue }
export interface ShowChecks {
  project: Project; epoch: number; moves: MoveCheck[]; selected: Finding | null;
  draft: { index: number; state: AnalysisState; results?: { input: AnalysisInput; result: AnalysisResult }[] } | null;
}
const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const empty: TransitionIssue[] = [];

/** One move at a time crosses the worker boundary. Unchanged moves retain their
 * results, and changed moves lose theirs synchronously, before React renders.
 * A separate worker owns coalesced drag snapshots; they never enter this cache. */
export class ShowAnalysis {
  private value: ShowChecks;
  private listeners = new Set<() => void>();
  private committed: AnalysisClient;
  private preview: AnalysisClient;
  private active: { input: AnalysisInput; move: MoveCheck } | null = null;
  private draftTimer?: ReturnType<typeof setTimeout>;
  private draftUpdates: { index: number; updates: Record<string, Point> } | null = null;
  private stop?: () => void;
  private draftInputs: AnalysisInput[] = [];
  private draftActive: AnalysisInput | null = null;
  private draftResults: { input: AnalysisInput; result: AnalysisResult }[] = [];
  private disposed = false;
  constructor(private store: EditorStore, private factory: () => AnalysisWorker, private draftDelay = 120) {
    const s = store.getState();
    this.value = { project: s.project.present, epoch: s.ui.projectEpoch, moves: [], selected: null, draft: null };
    this.committed = this.createCommitted();
    this.preview = this.createPreview();
  }
  private createCommitted() { return new AnalysisClient(this.factory, state => this.receive(state)); }
  private createPreview() {
    return new AnalysisClient(this.factory, state => {
      if (!this.value.draft || !this.draftActive || state.input !== this.draftActive || state.status === 'pending') return;
      if (state.status === 'error') {
        this.draftInputs = []; this.draftActive = null;
        this.publish({ ...this.value, draft: { ...this.value.draft, state } }); return;
      }
      if (state.result) this.draftResults.push({ input: this.draftActive, result: state.result });
      this.draftActive = this.draftInputs.shift() ?? null;
      if (this.draftActive) { this.preview.request(this.draftActive); return; }
      const issues = this.draftResults.flatMap(r => r.result.issues);
      this.publish({ ...this.value, draft: { ...this.value.draft, state: { ...state, result: state.result ? { ...state.result, issues } : undefined }, results: this.draftResults } });
    });
  }

  getSnapshot = () => this.value;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(value: ShowChecks) { this.value = value; this.listeners.forEach(fn => fn()); }
  start() {
    if (this.disposed) { this.committed = this.createCommitted(); this.preview = this.createPreview(); this.active = null; }
    this.disposed = false;
    this.stop = this.store.subscribe(() => {
      const s = this.store.getState();
      if (s.project.present !== this.value.project || s.ui.projectEpoch !== this.value.epoch) this.update();
    });
    this.update(); this.next();
  }
  private update() {
    const s = this.store.getState(), project = s.project.present, epoch = s.ui.projectEpoch;
    const old = this.value, reusable = epoch === old.epoch && project.id === old.project.id;
    let count = 0;
    const moves = project.moves.map((move, i): MoveCheck => {
      const signature = [epoch, project.id, project.field, project.performers, project.sections, project.analysisRules, move, project.sets[i].positions, project.sets[i + 1].positions, count];
      count += move.counts;
      const previous = reusable ? old.moves.find(m => m.moveId === move.id) : undefined;
      return previous && same(previous.signature, signature) ? (previous.index === i + 1 ? previous : { ...previous, index: i + 1 })
        : { index: i + 1, moveId: move.id, signature, status: 'pending', issues: empty };
    });
    const changed = !reusable || moves.length !== old.moves.length || moves.some((m, i) => m !== old.moves[i]);
    if (changed) {
      this.active = null; this.committed.request(null);
      this.clearDraft(false);
    }
    this.publish({ project, epoch, moves, selected: changed ? null : old.selected, draft: changed ? null : old.draft });
    if (changed) this.next();
  }
  private next() {
    if (this.disposed || this.active) return;
    const index = this.store.getState().selection.activeIndex;
    const move = this.value.moves.find(m => m.index === index && m.status === 'pending') ?? this.value.moves.find(m => m.status === 'pending');
    if (!move) return;
    const input = transitionInput(this.value.project, move.index, this.value.epoch)!;
    this.active = { input, move }; this.committed.request(input);
  }
  private receive(state: AnalysisState) {
    const active = this.active;
    if (!active || active.input !== state.input || state.status === 'pending') return;
    const updated: MoveCheck = { ...active.move, status: state.status, issues: state.result?.issues ?? empty, error: state.error };
    this.active = null;
    this.publish({ ...this.value, moves: this.value.moves.map(m => m === active.move ? updated : m) });
    this.next();
  }
  retry = () => {
    this.publish({ ...this.value, moves: this.value.moves.map(m => m.status === 'error' ? { ...m, status: 'pending', error: undefined } : m) });
    this.next();
  };
  select(finding: Finding) { this.publish({ ...this.value, selected: finding }); }
  clearSelection = () => this.publish({ ...this.value, selected: null });
  /** Leading/trailing throttle, not a debounce: a continuous drag gets checks.
   * Every pointer move invalidates the prior preview immediately. */
  draft(index: number, updates: Record<string, Point> | null) {
    if (!updates) { this.clearDraft(); return; }
    if (!this.value.project.moves.length) return;
    this.draftActive = null; this.draftInputs = []; this.draftResults = [];
    this.draftUpdates = { index, updates };
    this.preview.request(null);
    this.publish({ ...this.value, selected: null, draft: { index, state: { input: null, status: 'pending' } } });
    if (this.draftTimer) return;
    this.draftTimer = setTimeout(() => {
      this.draftTimer = undefined;
      const draft = this.draftUpdates;
      if (!draft || this.disposed) return;
      const project = this.value.project;
      const sets = project.sets.map((set, i) => i === draft.index ? { ...set, positions: { ...set.positions, ...draft.updates } } : set);
      const inputs = [draft.index, draft.index + 1].map(i => transitionInput({ ...project, sets }, i, this.value.epoch)).filter((input): input is AnalysisInput => !!input);
      this.draftActive = inputs[0]; this.draftInputs = inputs.slice(1);
      this.publish({ ...this.value, draft: { index: draft.index, state: { input: inputs[0], status: 'pending' } } });
      this.preview.request(inputs[0]);
    }, this.draftDelay);
  }
  private clearDraft(publish = true) {
    clearTimeout(this.draftTimer); this.draftTimer = undefined; this.draftUpdates = null;
    this.draftActive = null; this.draftInputs = []; this.draftResults = [];
    this.preview.request(null);
    if (publish && this.value.draft) this.publish({ ...this.value, draft: null });
  }
  dispose() {
    this.disposed = true; this.stop?.(); clearTimeout(this.draftTimer);
    this.committed.dispose(); this.preview.dispose(); this.listeners.clear();
  }
}

export interface ProblemFilter { severity: string; type: string; moveId: string; query: string; sort: 'count' | 'severity' | 'move' }
export const defaultProblemFilter: ProblemFilter = { severity: 'all', type: 'all', moveId: 'all', query: '', sort: 'count' };
export function findings(checks: ShowChecks, filter: ProblemFilter): Finding[] {
  const query = filter.query.trim().toLowerCase();
  const rows: Finding[] = [];
  for (const move of checks.moves) {
    if (move.status !== 'ready' || filter.moveId !== 'all' && move.moveId !== filter.moveId) continue;
    for (const issue of move.issues) {
      if (filter.severity !== 'all' && issue.severity !== filter.severity || filter.type !== 'all' && issue.type !== filter.type) continue;
      if (query && !`${issue.message} ${issue.performerIds.join(' ')} ${checks.project.sets[move.index].name}`.toLowerCase().includes(query)) continue;
      rows.push({ index: move.index, moveId: move.moveId, issue });
    }
  }
  return rows.sort((a, b) => (filter.sort === 'severity' ? Number(b.issue.severity === 'danger') - Number(a.issue.severity === 'danger') : filter.sort === 'move' ? a.index - b.index : 0)
    || (a.issue.atCount ?? 0) - (b.issue.atCount ?? 0) || a.index - b.index);
}

/** At most one marker per pixel bucket. The panel retains every finding. */
export function problemMarkers(moves: MoveCheck[], start: number, span: number, width: number) {
  const buckets = new Map<number, { finding: Finding; count: number; danger: boolean }>();
  for (const move of moves) if (move.status === 'ready') for (const issue of move.issues) {
    const at = issue.atCount ?? 0;
    if (at < start || at > start + span) continue;
    const key = Math.floor((at - start) / span * Math.max(1, width / 14));
    const bucket = buckets.get(key);
    if (bucket) { bucket.count++; bucket.danger ||= issue.severity === 'danger'; }
    else buckets.set(key, { finding: { index: move.index, moveId: move.moveId, issue }, count: 1, danger: issue.severity === 'danger' });
  }
  return [...buckets.values()];
}

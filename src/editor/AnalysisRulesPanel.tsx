import { directionSummary } from '../analysis/rules';
import { useState } from 'react';
import { Modal } from '../components/Modal';
import { DEFAULT_ANALYSIS_RULES, MARCHING_DIRECTIONS, validateAnalysisRules } from '../analysis/rules';
import { CLEARANCE_LIMITS, DEFAULT_CLEARANCE_RULES, validateClearanceRules, type ClearanceRules } from '../analysis/clearanceRules';
import type { AnalysisOverrides, AnalysisThresholds, DirectionRules, MarchingDirection, ProjectAnalysisRules, SectionAnalysisRules } from '../types';
import type { EditorController } from './useEditorController';
import { sameAnalysisRules } from './analysisCommands';
import { HelpButton } from './ControlHelp';
import { PROJECT_LIMITS } from '../domain';
import './analysisRules.css';

export function AnalysisRulesPanel({ controller }: { controller: EditorController }) {
  const { project, index, selectedIds, dispatch } = controller;
  const [draft, setDraft] = useState<ProjectAnalysisRules>(() => structuredClone(project.analysisRules ?? { defaults: { ...DEFAULT_ANALYSIS_RULES } }));
  const [clearance, setClearance] = useState<ClearanceRules | null>(project.clearanceRules ?? null);
  const [scope, setScope] = useState('project'), [direction, setDirection] = useState<'base' | MarchingDirection>('base');
  const [declaration, setDeclaration] = useState<'unchanged' | 'unknown' | MarchingDirection>('unchanged');
  const [error, setError] = useState('');
  const sectionId = scope === 'project' ? undefined : scope.slice(8);
  const section = draft.sections?.find(s => s.sectionId === sectionId);
  const group = scope === 'project' ? draft : section;
  const value: AnalysisOverrides = direction === 'base' ? scope === 'project' ? draft.defaults : section ?? {} : group?.directions?.[direction] ?? {};
  const required = scope === 'project' && direction === 'base';
  const inherited = { ...draft.defaults, ...(scope === 'project' ? {} : section), ...(direction === 'base' ? {} : draft.directions?.[direction]) };
  let invalid = '';
  try { validateAnalysisRules(draft, new Set(project.sections.map(s => s.id))); } catch { invalid = 'Enter spacing and stride values from 0.1 to 5. Leave optional overrides empty to inherit.'; }
  if (!invalid && clearance) {
    try { validateClearanceRules(clearance); } catch { invalid = 'Enter a gap from 0 to 5 yards and footprint dimensions from 0.1 to 10 yards.'; }
  }
  const changed = declaration !== 'unchanged' || !sameAnalysisRules(draft, project.analysisRules)
    || JSON.stringify(clearance) !== JSON.stringify(project.clearanceRules ?? null);
  function edit(key: keyof AnalysisThresholds, raw: string) {
    const patch = { ...value };
    if (raw === '' && !required) delete patch[key]; else patch[key] = raw === '' ? NaN : Number(raw);
    setDraft(p => {
      if (scope === 'project') return direction === 'base' ? { ...p, defaults: patch as AnalysisThresholds } : { ...p, directions: { ...p.directions, [direction]: patch } };
      const previous = p.sections?.find(s => s.sectionId === sectionId) ?? { sectionId: sectionId! };
      const { minimumSpacing: _spacing, maximumStride: _stride, ...base } = previous;
      const next = direction === 'base' ? { ...base, ...patch } : { ...previous, directions: { ...previous.directions, [direction]: patch } };
      return { ...p, sections: [...p.sections?.filter(s => s.sectionId !== sectionId) ?? [], next] };
    }); setError('');
  }
  function resetOverride() {
    if (scope === 'project') setDraft(p => { if (direction === 'base') return { ...p, defaults: { ...DEFAULT_ANALYSIS_RULES } }; const directions: DirectionRules = { ...p.directions }; delete directions[direction]; return { ...p, directions }; });
    else setDraft(p => ({ ...p, sections: p.sections?.flatMap(s => { if (s.sectionId !== sectionId) return [s]; if (direction === 'base') { const { minimumSpacing: _s, maximumStride: _t, ...rest } = s; return [rest]; } const directions = { ...s.directions }; delete directions[direction]; return [{ ...s, directions } as SectionAnalysisRules]; }) }));
  }
  const move = index > 0 ? project.moves[index - 1] : undefined;
  const selected = project.performers.filter(p => selectedIds.includes(p.id));
  const assignments = Object.entries(move?.marchingDirections ?? {});
  const counts = move ? directionSummary(project, index - 1) : null;
  return <Modal title="Analysis rules" wide className="analysis-rules-panel" onClose={() => controller.setDialog(null)}>
    <form onSubmit={e => { e.preventDefault(); if (invalid) { setError(invalid); return; } if (!changed) return;
      const change = declaration === 'unchanged' ? undefined : { index, ids: selected.map(p => p.id), direction: declaration === 'unknown' ? null : declaration };
      if (dispatch('analysis.rules-save', { rules: draft, clearance, ...(change ? { declaration: change } : {}) })) controller.setDialog(null); else setError(controller.store.getState().ui.toast || 'Could not save analysis rules.');
    }}>
      <div className="analysis-rules-content">
      <p className="modal-intro">These rules travel with the production. Spacing measures center-to-center distance in yards. Stride measures peak yards per count, including easing.</p>
      <div className="form-row"><label className="form-label">Rule scope<select aria-label="Rule scope" value={scope} onChange={e => setScope(e.target.value)}><option value="project">Production defaults</option>{project.sections.map(s => <option value={`section:${s.id}`} key={s.id}>{s.name}</option>)}</select></label>
      <label className="form-label">Direction rule<select aria-label="Direction rule" value={direction} onChange={e => setDirection(e.target.value as typeof direction)}><option value="base">All directions / unknown</option>{MARCHING_DIRECTIONS.map(d => <option value={d} key={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}</select></label></div>
      <div className="form-row">{(['minimumSpacing', 'maximumStride'] as const).map(key => <label className="form-label" key={key}>{key === 'minimumSpacing' ? 'Minimum spacing · yards' : 'Maximum stride · yards/count'}<input type="number" aria-label={key === 'minimumSpacing' ? 'Rule minimum spacing' : 'Rule maximum stride'} min={PROJECT_LIMITS.analysisThreshold.min} max={PROJECT_LIMITS.analysisThreshold.max} step="any" required={required} value={value[key] === undefined || !Number.isFinite(value[key]) ? '' : value[key]} placeholder={`Inherit ${inherited[key]}`} onChange={e => edit(key, e.target.value)} /></label>)}</div>
      <p className="microcopy">{required ? 'Production defaults apply when there is no more specific rule.' : 'Leave either field empty to inherit that value.'} Rule precedence: production defaults → section base → production direction → section direction. For a pair, the larger of the performers’ minimum spacing values applies. Smaller maximum stride values are stricter; 1.25 yd/count equals 4 steps per 5 yd.</p>
      <button type="button" className="button subtle" onClick={resetOverride}>{required ? 'Restore historical defaults' : 'Remove this override'}</button>
      <details className="clearance-settings" open={!!project.clearanceRules}>
        <summary>Footprint clearance</summary>
        <label className="clearance-toggle"><input type="checkbox" checked={!!clearance} onChange={event => {
          setClearance(event.target.checked ? project.clearanceRules ?? DEFAULT_CLEARANCE_RULES : null); setError('');
        }} /> Check clearance with props</label>
        {clearance && <ClearanceFields value={clearance} onChange={value => { setClearance(value); setError(''); }} />}
        <p className="microcopy">The check compares this performer footprint and each prop’s planning shape on the field. It also checks pairs of props.</p>
      </details>
      <h3 className="modal-subtitle">Current move direction declarations</h3>
      <p className="microcopy">Explicit declarations override direction from authored facing. Squidware uses authored facing when both endpoints share a heading and the path has one clear direction. Unknown, stationary, turning and mixed-direction moves use the base rules unless declared.</p>
      {!move ? <p className="microcopy">The opening set has no incoming move. Select a later set and performers in Cast or the field to declare their travel.</p> : <>
        <p className="microcopy">Move into set {index + 1} · {project.sets[index].name}: {counts?.declared} declared, {counts?.['authored facing']} from facing, {counts?.unknown} unknown.</p>
        <label className="form-label">Direction for selected performers<select aria-label="Declare selected direction" value={declaration} disabled={!selected.length} onChange={e => setDeclaration(e.target.value as typeof declaration)}><option value="unchanged">Keep declarations unchanged</option><option value="unknown">Clear declaration</option>{MARCHING_DIRECTIONS.map(d => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}</select></label>
        <p className="microcopy" title={selected.map(p => p.label).join(', ')}>{selected.length ? `${selected.length} selected: ${selected.map(p => p.label).join(', ')}` : 'No performers selected. Close this dialog and select performers to declare their direction.'} Direction changes stay in the draft until Save rules and are undone together with rule edits.</p>
        {!!assignments.length && <details><summary>Saved declarations</summary><ul className="analysis-declarations">{assignments.map(([id,d]) => <li key={id}>{project.performers.find(p => p.id === id)?.label}: {d}</li>)}</ul></details>}
      </>}
      {(invalid || error) && <p className="field-error" role="alert">{error || invalid}</p>}
      </div>
      <div className="modal-actions"><button type="button" className="button subtle" onClick={() => controller.setDialog(null)}>Cancel</button><HelpButton type="submit" className="button primary" title="Save rules" description="Apply these rules and any declaration as one undoable edit." disabled={!!invalid || !changed} disabledReason={invalid ? 'Fix the highlighted values first.' : 'Change a rule or declaration first.'}>Save rules</HelpButton></div>
    </form>
  </Modal>;
}

function ClearanceFields({ value, onChange }: { value: ClearanceRules; onChange: (value: ClearanceRules) => void }) {
  const footprint = value.performer;
  const number = (label: string, amount: number, min: number, max: number, update: (amount: number) => void) =>
    <label className="form-label">{label}<input type="number" min={min} max={max} step="any" required
      value={Number.isFinite(amount) ? amount : ''} onChange={event => update(event.target.valueAsNumber)} /></label>;
  const dimension = (label: string, amount: number, update: (amount: number) => void) =>
    number(label, amount, CLEARANCE_LIMITS.minSize, CLEARANCE_LIMITS.maxSize, update);
  return <>
    <div className="form-row">
      <label className="form-label">Performer footprint<select value={footprint.shape} onChange={event => onChange({ ...value,
        performer: event.target.value === 'rectangle' ? { shape: 'rectangle', width: 1, depth: 1 } : { shape: 'circle', diameter: 1 } })}>
        <option value="circle">Circle</option><option value="rectangle">Rectangle</option>
      </select></label>
      {number('Required edge gap · yards', value.minimumGap, 0, CLEARANCE_LIMITS.maxGap, minimumGap => onChange({ ...value, minimumGap }))}
    </div>
    <div className="form-row">{footprint.shape === 'circle'
      ? dimension('Performer diameter · yards', footprint.diameter, diameter => onChange({ ...value, performer: { ...footprint, diameter } }))
      : <>{dimension('Performer width · yards', footprint.width, width => onChange({ ...value, performer: { ...footprint, width } }))}
        {dimension('Performer depth · yards', footprint.depth, depth => onChange({ ...value, performer: { ...footprint, depth } }))}</>}
    </div>
  </>;
}

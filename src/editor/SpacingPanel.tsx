import { useEffect, useRef } from 'react';
import { NumberField } from '../components/NumberField';
import { spacingUnit, type SpacingOptions } from '../spacing';
import { DEFAULT_SNAPPING } from '../snapping';
import { HelpButton } from './ControlHelp';
import type { EditorController } from './useEditorController';

export function SpacingPanel({ controller: c }: { controller: EditorController }) {
  const section = useRef<HTMLElement>(null);
  useEffect(() => { section.current?.scrollIntoView({ block: 'nearest' }); section.current?.querySelector<HTMLElement>('button[aria-pressed="true"]')?.focus(); }, []);
  const session = c.spacingPreview; if (!session) return null;
  const options = session.options; const result = c.spacingResult!;
  const update = (patch: Partial<SpacingOptions>) => c.dispatch('spacing.update', { options: { ...options, ...patch } });
  const display = (n: number) => Number(n.toFixed(4));
  const gaps = result.groups.filter(g => g.ids.length > 1).map(g => g.interval);
  const gapSummary = !gaps.length ? 'none' : `${display(Math.min(...gaps))}–${display(Math.max(...gaps))} yd`;
  const choice = (name: string, text: string, active: boolean, action: () => void, description: string) => <HelpButton title={name} description={description} aria-pressed={active} className={active ? 'button primary' : 'button subtle'} disabled={c.pendingDraft} disabledReason="Finish or cancel the pending input before changing spacing choices." onClick={action}>{text}</HelpButton>;
  return <section ref={section} className="inspector-section transform-panel spacing-panel" aria-label="Spacing and alignment preview">
    <h3>Spacing and alignment</h3>
    <p className="section-description">{session.ids.length} selected · set {c.index + 1}. Only this selection changes after Apply.</p>
    <div className="spacing-choices" role="group" aria-label="Spacing operation">
      {choice('Align coordinates', 'Align', options.operation === 'align', () => update({ operation: 'align' }), 'Give selected performers the same coordinate on the chosen axis. The perpendicular coordinate stays fixed.')}
      {choice('Distribute evenly', 'Distribute', options.operation === 'distribute', () => update({ operation: 'distribute' }), 'Place performers at equal projected intervals between the existing first and last coordinates. Extrema stay fixed.')}
      {choice('Set exact interval', 'Interval', options.operation === 'interval', () => update({ operation: 'interval' }), 'Set an exact projected center-to-center interval around the chosen anchor, preserving perpendicular coordinates.')}
    </div>
    <p className="form-label">Coordinate axis</p>
    <div className="form-row" role="group" aria-label="Spacing coordinate axis">
      {choice('Use field X axis', 'X · left/right', options.angle === 0, () => update({ angle: 0 }), 'Change X; keep Y fixed. Align makes a file. Intervals run across the field.')}
      {choice('Use field Y axis', 'Y · back/front', options.angle === 90, () => update({ angle: 90 }), 'Change Y; keep X fixed. Align makes a rank. Intervals run from back to front.')}
    </div>
    <NumberField label="Axis angle · degrees" description="Physical coordinate axis clockwise from field X. Use a rotated rank's angle to space along it; add 90° to align onto it. Display orientation does not change this axis." value={options.angle} min={-3600} max={3600} step={1} onDraftChange={c.setPendingDraft} onChange={angle => update({ angle })} />
    {options.operation === 'interval' && <>
      <div className="form-row" role="group" aria-label="Interval units">
        {(['yards', 'steps'] as const).map(unit => <span key={unit}>{choice(`Interval in ${unit}`, unit === 'yards' ? 'Yards' : `${(c.project.snapping ?? DEFAULT_SNAPPING).steps}-to-5 steps`, options.unit === unit, () => update({ unit, interval: options.interval * spacingUnit(options, c.project) / spacingUnit({ ...options, unit }, c.project) }), 'Change the displayed unit while preserving the physical interval. Steps use the production step size, independently of grid subdivision.')}</span>)}
      </div>
      <NumberField key={options.unit} label={`Interval · ${options.unit}`} description="Projected center-to-center interval. Enter updates the preview; Apply commits it. Exact spacing bypasses snapping." value={options.interval} min={.001} max={1000} step={options.unit === 'steps' ? .25 : .1} onDraftChange={c.setPendingDraft} onChange={interval => update({ interval })} />
      <p className="microcopy">{display(options.interval * spacingUnit(options, c.project))} yd per gap. Drag the square interval handle or enter a number.</p>
    </>}
    {options.operation !== 'distribute' ? <>
      <p className="form-label">{options.operation === 'align' ? 'Align to' : 'Keep fixed'}</p>
      <div className="spacing-choices" role="group" aria-label="Spacing anchor">
        {(['start', 'center', 'end'] as const).map(anchor => <span key={anchor}>{choice(`Anchor ${anchor}`, anchor === 'start' ? 'Minimum' : anchor === 'end' ? 'Maximum' : 'Center', options.anchor === anchor, () => update({ anchor }), 'Use the minimum coordinate, bounds midpoint, or maximum coordinate on this physical axis. Interval anchoring is evaluated separately for each lane.')}</span>)}
      </div>
    </> : <p className="microcopy">Distribution keeps both extrema fixed. Perpendicular coordinates stay unchanged.</p>}
    {options.operation !== 'align' && <>
      <HelpButton title="Space each lane separately" description="Group performers by their perpendicular coordinate. Each lane starts at its smallest perpendicular coordinate and includes dots within the stated tolerance. Singletons stay fixed." aria-pressed={options.lanes} className={options.lanes ? 'button primary spacing-lanes' : 'button subtle spacing-lanes'} disabled={c.pendingDraft} disabledReason="Finish or cancel the pending input first." onClick={() => update({ lanes: !options.lanes })}>Each rank/file: {options.lanes ? 'on' : 'off'}</HelpButton>
      {options.lanes && <NumberField label="Lane tolerance · yards" description="Maximum perpendicular distance from the first dot in each lane. Preview groups before Apply; irregular groups can form singleton lanes." value={options.laneTolerance} min={0} max={10} step={.05} onDraftChange={c.setPendingDraft} onChange={laneTolerance => update({ laneTolerance })} />}
    </>}
    <p className={`transform-result${result.error ? ' transform-result--error' : ''}`} role="status">{result.error || (c.pendingDraft ? 'Finish or cancel incomplete inputs before applying.' : result.changed ? 'Preview ready. Apply records one undo action.' : 'Preview matches the original positions.')}</p>
    {options.operation !== 'align' && <p className="spacing-summary microcopy">{result.groups.length} {options.lanes ? 'lanes' : 'group'} · {result.groups.filter(g => g.ids.length === 1).length} singletons. Gaps: {gapSummary}.</p>}
    <p className="microcopy">Order follows position along the axis, then perpendicular position, then performer ID for ties. With one group, irregular rows may cross or overlap. Guides show projected spacing; review actual clearance.</p>
    <p className="microcopy">Exact tools bypass snapping and reject field crossings. Selection or context changes cancel the preview. Escape cancels; Enter on the field applies.</p>
  </section>;
}

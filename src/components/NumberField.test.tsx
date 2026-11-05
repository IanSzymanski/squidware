import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormattedNumberInput, formattedNumber, syncedNumberDraft } from './NumberField';
import { formatTimelineCount } from '../editor/timelineNavigation';
import { newScheduleRow, pathFromRows, type ScheduleRow } from '../editor/movementScheduleEditing';

describe('formatted live number input', () => {
  it('formats finite values for display and keeps empty or incomplete text as typed', () => {
    expect(formattedNumber(160 / 3 / 2)).toBe('26.667'); expect(formattedNumber('52.333333333333336')).toBe('52.333'); expect(formattedNumber('20')).toBe('20');
    expect(formattedNumber(3.1254, formatTimelineCount)).toBe('3.125');
    expect(formattedNumber(NaN)).toBe(''); expect(formattedNumber('')).toBe(''); expect(formattedNumber('-')).toBe('-'); expect(formattedNumber(' ')).toBe(' ');
  });
  it('keeps partial typing that already denotes the new value', () => {
    expect(syncedNumberDraft('26.', '26.')).toBe('26.'); expect(syncedNumberDraft('26.', 26)).toBe('26.');
    expect(syncedNumberDraft('26.6666', 26.6666)).toBe('26.6666'); expect(syncedNumberDraft('-', NaN)).toBe('-'); expect(syncedNumberDraft('', '')).toBe('');
    expect(syncedNumberDraft('.5', '0.5')).toBe('.5');
  });
  it('resyncs to the formatted value when a drag, nudge or Escape restore changes the number', () => {
    expect(syncedNumberDraft('52.333', 52.43333333333334)).toBe('52.433');
    expect(syncedNumberDraft('35', '52.333333333333336')).toBe('52.333');
    expect(syncedNumberDraft('', 0)).toBe('0'); expect(syncedNumberDraft('26.', NaN)).toBe('');
    expect(syncedNumberDraft('4', '4.5', formatTimelineCount)).toBe('4.5');
  });
  it('renders the formatted value with the caller’s label, step and bounds', () => {
    const html = renderToStaticMarkup(<FormattedNumberInput aria-label="Start Y" step="0.1" min={0} max={160 / 3} value={160 / 3 / 2} onChange={() => {}} />);
    expect(html).toContain('type="number"'); expect(html).toContain('value="26.667"'); expect(html).toContain('aria-label="Start Y"');
    expect(html).toContain('step="0.1"'); expect(html).toContain('min="0"'); expect(html).toContain(`max="${160 / 3}"`);
    expect(renderToStaticMarkup(<FormattedNumberInput aria-label="Group cue 1 count" value={NaN} onChange={() => {}} />)).toContain('value=""');
    expect(renderToStaticMarkup(<FormattedNumberInput aria-label="Interval 1 Arrival count" value="12.0004" format={formatTimelineCount} onChange={() => {}} />)).toContain('value="12"');
  });
  it('only rounds the display: untouched default rows keep exact thirds through a round trip', () => {
    const row: ScheduleRow = { ...newScheduleRow({ x: 10, y: 10 }, { x: 30, y: 20 }, 16), kind: 'cubic' }, exact = structuredClone(row);
    expect([row.c1x, row.c1y, row.c2x, row.c2y].map(value => formattedNumber(value))).toEqual(['16.667', '13.333', '23.333', '16.667']);
    expect(row).toEqual(exact);
    const segment = pathFromRows([row])!.segments[0];
    expect(segment).toMatchObject({ kind: 'cubic', control1: { x: 10 + 20 / 3, y: 10 + 10 / 3 }, control2: { x: 10 + 40 / 3, y: 10 + 20 / 3 } });
  });
});

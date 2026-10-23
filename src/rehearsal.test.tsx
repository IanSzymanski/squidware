import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import v1 from './fixtures/schema-v1.squid?raw';
import { parseProject, serializeProject, setStartCount, PROJECT_LIMITS } from './domain';
import { anchorAtCount, rehearsalBounds, resolveAnchor, resolveFocus, resolvePassage, validateRehearsal } from './rehearsal';
import type { RehearsalPassage } from './types';
import { createEditorStore } from './editor/store';
import { canEditPositions } from './editor/editMode';
import { PrintOutput } from './components/PrintOutput';
import { createPerformanceFixture } from './performanceFixtures';
const fixture = () => parseProject(v1);
function passage(): RehearsalPassage { const p = fixture(); return { id: 'passage', name: 'Work the arrival', notes: 'Keep the interval.\nListen back.', start: anchorAtCount(p, 4.5), end: { kind: 'set', setId: p.sets[2].id }, focus: { kind: 'section', sectionId: p.sections[0].id } }; }

describe('saved rehearsal metadata and stable targets', () => {
  it('round trips fractional cross-move ranges, annotations, focus and bookmarks without changing old projects', () => {
    const p = fixture(), item = passage();
    p.rehearsal = [item, { ...item, id: 'bookmark', start: { kind: 'set', setId: p.sets[0].id }, end: undefined, focus: { kind: 'performers', performerIds: ['a'] } }];
    expect(parseProject(serializeProject(p))).toEqual(p);
    expect(fixture().rehearsal).toBeUndefined();
    expect(resolvePassage(p, item).start.count).toBe(4.5);
    expect(resolvePassage(p, item).end?.count).toBe(setStartCount(p, 2));
    expect(rehearsalBounds(p, item.id)).toEqual({ start: 4.5, end: setStartCount(p, 2) });
    expect(rehearsalBounds(p, 'bookmark').start).toBe(0);
  });
  it('sets follow their identity through insertion and reorder; changed moves, shortened counts and reversed ranges are flagged', () => {
    const p = fixture(), store = createEditorStore(p), item = passage();
    expect(store.dispatch('rehearsal.save', { passage: item })).toBe(true);
    const anchor = { kind: 'set' as const, setId: p.sets[1].id };
    store.dispatch('set.create', { index: 0, kind: 'hold', counts: 3 });
    let next = store.getState().project.present;
    expect(resolveAnchor(next, anchor).count).toBe(setStartCount(p, 1) + 3);
    expect(resolvePassage(next, item).error).toMatch(/endpoints/);
    store.dispatch('history.undo');
    store.dispatch('set.update', { index: 1, update: { counts: 2 } });
    expect(resolvePassage(store.getState().project.present, item).error).toMatch(/exceeds/);
    expect(resolvePassage(p, { ...item, start: item.end!, end: item.start }).error).toMatch(/follow/);
    store.dispatch('history.undo'); store.dispatch('set.reorder', { index: 1, direction: 1 });
    next = store.getState().project.present;
    expect(resolveAnchor(next, anchor).label).toContain('Set 3');
    expect(resolvePassage(next, item).error).toMatch(/endpoints/);
  });
  it('retains missing references through file reload, flags empty sections and never broadens a missing performer focus', () => {
    const p = fixture(), store = createEditorStore(p), item = { ...passage(), start: { kind: 'set' as const, setId: p.sets[1].id } };
    store.dispatch('rehearsal.save', { passage: item }); store.dispatch('set.remove', { index: 1 });
    const next = parseProject(serializeProject(store.getState().project.present));
    expect(resolvePassage(next, next.rehearsal![0]).error).toMatch(/deleted/);
    expect(resolveFocus(p, { kind: 'performers', performerIds: ['missing'] })).toMatchObject({ ids: [], error: expect.stringMatching(/deleted/) });
    const section = p.sections[0].id;
    expect(resolveFocus({ ...p, performers: [] }, { kind: 'section', sectionId: section }).error).toMatch(/no performers/);
    expect(resolveFocus(p, { kind: 'section', sectionId: 'missing' }).error).toMatch(/deleted/);
    const updated = { ...p, performers: p.performers.map(person => ({ ...person, sectionId: section })) };
    expect(resolveFocus(updated, { kind: 'section', sectionId: section }).ids).toHaveLength(p.performers.length);
  });
  it('makes metadata one named undo transaction; activation and clearing are session-only and protect geometry', () => {
    const p = fixture(), store = createEditorStore(p), item = passage();
    expect(store.dispatch('rehearsal.save', { passage: item })).toBe(true);
    expect(store.getState().project.past).toHaveLength(1);
    expect(store.getState().project.past[0].name).toBe('Save rehearsal passage · Work the arrival');
    store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(p);
    store.dispatch('history.redo');
    const before = serializeProject(store.getState().project.present);
    expect(store.dispatch('rehearsal.activate', { id: item.id })).toBe(true);
    expect(store.getState().playback.count).toBe(4.5); expect(canEditPositions(store.getState())).toBe(false);
    store.dispatch('playback.toggle'); expect(store.getState().playback.playing).toBe(true);
    store.dispatch('playback.scrub', { count: 5 }); expect(store.getState().playback.rehearsalId).toBe(item.id);
    store.dispatch('playback.scrub', { count: 0 }); expect(store.getState().playback.rehearsalId).toBeNull();
    store.dispatch('rehearsal.activate', { id: item.id }); store.dispatch('rehearsal.clear');
    expect(serializeProject(store.getState().project.present)).toBe(before);
    expect(store.getState().project.past).toHaveLength(1);
    store.dispatch('rehearsal.activate', { id: item.id }); store.dispatch('set.select', { index: 1 });
    expect(store.getState().playback.rehearsalId).toBeNull(); expect(canEditPositions(store.getState())).toBe(true);
  });
  it('stops and clears invalid active passages after project edits and undo, and clears activation on load', () => {
    const p = fixture(), store = createEditorStore(p), item = passage(); store.dispatch('rehearsal.save', { passage: item });
    store.dispatch('rehearsal.activate', { id: item.id }); store.dispatch('playback.toggle');
    store.dispatch('set.remove', { index: 1 });
    expect(store.getState().playback).toMatchObject({ rehearsalId: null, playing: false });
    expect(store.getState().ui.toast).toMatch(/Rehearsal focus cleared/);
    store.dispatch('history.undo'); store.dispatch('rehearsal.activate', { id: item.id }); store.dispatch('history.undo');
    expect(store.getState().playback.rehearsalId).toBeNull();
    store.dispatch('history.redo'); store.dispatch('rehearsal.activate', { id: item.id });
    store.dispatch('project.load', { project: store.getState().project.present });
    expect(store.getState().playback.rehearsalId).toBeNull();
  });
  it('rejects invalid commands atomically, bounds metadata and canonicalizes malformed file inputs', () => {
    const p = fixture(), store = createEditorStore(p), item = passage();
    for (const bad of [{ ...item, name: ' ' }, { ...item, notes: '\u0000' }, { ...item, start: { ...item.start, count: NaN } }, { ...item, focus: { kind: 'performers', performerIds: [] } }, { ...item, end: item.start }]) {
      expect(store.dispatch('rehearsal.save', { passage: bad as RehearsalPassage })).toBe(false);
      expect(store.getState().project.present).toEqual(p); expect(store.getState().project.past).toHaveLength(0);
    }
    expect(() => validateRehearsal(Array.from({ length: PROJECT_LIMITS.rehearsalPassages + 1 }, (_, i) => ({ ...item, id: `p${i}` })))).toThrow(/128/);
    expect(() => validateRehearsal([item, item])).toThrow(/duplicates/);
    expect(() => validateRehearsal([{ ...item, start: { kind: 'other' } }])).toThrow(/kind/);
  });
  it('resolves and recalls ranges at the 128-set limit', () => {
    const p = createPerformanceFixture('maximum'), store = createEditorStore(p);
    const item = { ...passage(), start: { kind: 'set' as const, setId: p.sets[126].id }, end: { kind: 'set' as const, setId: p.sets[127].id }, focus: { kind: 'all' as const } };
    expect(store.dispatch('rehearsal.save', { passage: item })).toBe(true);
    store.dispatch('rehearsal.activate', { id: item.id });
    expect(store.getState().selection.activeIndex).toBe(126);
    expect(rehearsalBounds(store.getState().project.present, item.id).end).toBe(setStartCount(p, 127));
  });
  it.each(['charts', 'coordinates'] as const)('prints consistent escaped passage references and repair warnings with %s', mode => {
    const p = fixture(), item = { ...passage(), name: '<Passage>', notes: '<script>bad</script>' }; p.rehearsal = [item];
    let html = renderToStaticMarkup(<PrintOutput project={p} mode={mode} />);
    expect(html).toContain('&lt;Passage&gt;'); expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>');
    expect(html).toContain(`show count 4.5–${setStartCount(p, 2)}`);
    p.rehearsal[0].start = { kind: 'set', setId: 'missing' };
    html = renderToStaticMarkup(<PrintOutput project={p} mode={mode} />); expect(html).toContain('Needs repair: Target set was deleted');
  });
});

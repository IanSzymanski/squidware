import { describe, expect, it } from 'vitest';
import { createBlankProject, createDemoProject, parseProject, serializeProject } from '../domain';
import { captureParametricFormation } from './formations';
import { captureShowTemplate, productionFromTemplate } from './production';
import { parseTemplateLibrary, serializeTemplateLibrary, TEMPLATE_LIMITS, validateTemplate, validateTemplateLibrary } from './library';
import type { TemplateLibrary } from './library';

const source = createDemoProject();
const show = captureShowTemplate(source, 'Ensemble setup');
const formation = captureParametricFormation('Arc', 'arc', { center: { x: 50, y: 25 }, rotation: 0, width: 20, height: 10, columns: 4 }, 64);
const library: TemplateLibrary = { format: 'squidware-template-library', version: 1, entries: [show, formation] };

describe('template library import and export boundary', () => {
  it('round-trips mixed and empty libraries without aliasing input objects', () => {
    expect(parseTemplateLibrary(serializeTemplateLibrary(library))).toEqual(library);
    const copy = validateTemplateLibrary(library);
    expect(copy.entries[0]).not.toBe(show);
    if (copy.entries[0].kind === 'show') copy.entries[0].sections[0].name = 'Changed';
    expect(show.sections[0].name).toBe('Section 1');
    const empty = { ...library, entries: [] };
    expect(parseTemplateLibrary(serializeTemplateLibrary(empty))).toEqual(empty);
  });
  it('discards unknown metadata at every level on import and export', () => {
    const untrusted = JSON.parse(JSON.stringify(library));
    untrusted.owner = 'private@example.org';
    untrusted.entries[0].audio = '/private/recording.mp3';
    untrusted.entries[0].sections[0].performers = [{ name: 'Private Student' }];
    untrusted.entries[1].geometry.performerIds = ['private-id'];
    untrusted.entries[1].geometry.__proto__ = { leaked: 'private' };
    expect(parseTemplateLibrary(JSON.stringify(untrusted))).toEqual(library);
    const encoded = serializeTemplateLibrary(untrusted);
    for (const secret of ['private@example', '/private/', 'Private Student', 'private-id', 'leaked']) expect(encoded).not.toContain(secret);
  });
  it.each([null, [], {}, { ...library, format: 'squid' }, { ...library, version: 0 }, { ...library, version: 2 }, { ...library, version: '1' }])('rejects incompatible roots: %j', value => {
    expect(() => validateTemplateLibrary(value)).toThrow(/template library/);
  });
  it('reports corrupt JSON and newer format versions clearly', () => {
    expect(() => parseTemplateLibrary('{broken')).toThrow(/valid JSON/);
    expect(() => parseTemplateLibrary(JSON.stringify({ ...library, version: 99 }))).toThrow(/newer files.*update/);
  });
  it('bounds file bytes, entry counts and total roster size before creating a production', () => {
    expect(() => parseTemplateLibrary(' '.repeat(TEMPLATE_LIMITS.bytes + 1))).toThrow(/1 MiB/);
    expect(() => parseTemplateLibrary('é'.repeat(TEMPLATE_LIMITS.bytes / 2 + 1))).toThrow(/1 MiB/);
    expect(() => validateTemplateLibrary({ ...library, entries: Array(101).fill(show) })).toThrow(/100/);
    expect(() => validateTemplate({ ...show, sections: Array(2).fill({ name: 'Section', color: '#112233', count: 251 }) })).toThrow(/total at most 500/);
    const huge = { ...formation, name: 'é'.repeat(160), sourceCount: 500, geometry: { kind: 'snapshot', points: Array(500).fill({ x: .123456789, y: .987654321 }) } };
    expect(() => serializeTemplateLibrary({ ...library, entries: Array(100).fill(huge) })).toThrow(/1 MiB/);
  });
  it.each([
    { kind: 'unknown' }, { name: '' }, { name: 'bad\u0000name' }, { sourceCount: 0 }, { sourceCount: 501 },
    { sourceCount: 2.5 }, { coordinateFrame: 'pixels' }, { geometry: { kind: 'unknown' } },
    { geometry: { ...formation.geometry, width: NaN } }, { geometry: { ...formation.geometry, height: Infinity } },
    { geometry: { ...formation.geometry, columns: 1.5 } }, { geometry: { ...formation.geometry, shape: 'unknown' } },
    { geometry: { kind: 'snapshot', points: [] } },
  ])('rejects invalid formation entries: %j', patch => {
    expect(() => validateTemplate({ ...formation, ...patch })).toThrow();
  });
  it.each([
    { sections: [] }, { sections: [{ name: 'S', color: 'red', count: 2 }] },
    { sections: [{ name: 'S', color: '#112233', count: -1 }] },
    { sections: [{ name: 'S', color: '#112233', count: .5 }] },
    { field: { ...show.field, width: 50 } }, { field: { ...show.field, preset: 'unknown' } },
    { openingTiming: { tempo: 401, transition: 'linear' } }, { openingTiming: { tempo: 120, transition: 'unknown' } },
  ])('rejects unsupported show defaults: %j', patch => {
    expect(() => validateTemplate({ ...show, ...patch })).toThrow();
  });
});

describe('privacy-safe new-show templates', () => {
  it('includes only explicitly named template settings with generic section names by default', () => {
    const project = structuredClone(source);
    project.title = 'Confidential Show'; project.ensemble = 'Private School';
    project.performers[0].name = 'Private Student'; project.performers[0].label = 'Private Label';
    project.sections[0].name = 'Private Instructor'; project.sets[0].notes = 'Private notes';
    const captured = captureShowTemplate(project, 'Reusable setup');
    const json = JSON.stringify(captured);
    for (const text of ['Confidential', 'Private', project.id, project.performers[0].id, project.sections[0].id, 'audio', 'notes']) expect(json).not.toContain(text);
    expect(captured.sections.map(section => section.count)).toEqual([24, 24, 8, 8]);
    expect(captured.sections.map(section => section.color)).toEqual(project.sections.map(section => section.color));
    expect(captureShowTemplate(project, 'Named setup', { includeSectionNames: true }).sections[0].name).toBe('Private Instructor');
  });
  it('creates valid, independent productions with fresh identities and an anonymous staging grid', () => {
    const first = productionFromTemplate(show), second = productionFromTemplate(show);
    expect(first.performers).toHaveLength(source.performers.length);
    expect(first.performers.every(performer => performer.name === '' && /^S\d+-\d+$/.test(performer.label))).toBe(true);
    expect(first.sets).toHaveLength(1); expect(first.moves).toEqual([]); expect(first.ensemble).toBe('');
    expect(first.title).toBe('Untitled show'); expect(first.audioOffsetSeconds).toBe(0);
    expect(first.openingTiming).toEqual(show.openingTiming);
    const identities = (project: typeof first) => [project.id, ...project.sections.map(s => s.id), ...project.performers.map(p => p.id), ...project.sets.map(s => s.id)];
    expect(identities(first).some(id => identities(source).includes(id) || identities(second).includes(id))).toBe(false);
    expect(parseProject(serializeProject(first))).toEqual(first);
    first.sections[0].name = 'Local edit'; first.field.preset = 'high-school';
    expect(show.sections[0].name).toBe('Section 1'); expect(second.field).toEqual(show.field);
  });
  it.each([0, 1, 500])('creates a bounded opening picture for %i performers', count => {
    const template = captureShowTemplate(createBlankProject(), 'Setup');
    template.sections[0].count = count;
    const project = productionFromTemplate(template);
    expect(project.performers).toHaveLength(count);
    expect(Object.keys(project.sets[0].positions)).toHaveLength(count);
    expect(parseProject(serializeProject(project))).toEqual(project);
    for (const point of Object.values(project.sets[0].positions)) {
      expect(point.x).toBeGreaterThanOrEqual(0); expect(point.x).toBeLessThanOrEqual(project.field.width);
      expect(point.y).toBeGreaterThanOrEqual(0); expect(point.y).toBeLessThanOrEqual(project.field.height);
    }
  });
});

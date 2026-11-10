// "Tether": original drill for Squidwriter's Space show. 165 members: 84 brass, 24 battery, 13 front ensemble, 44 guard.
import type { PathSegment, Point, ProjectAnalysisRules, RehearsalPassage, ScatterRegion, SelectionGroup, SharedRoute } from '../../src/types';
import { arcPath, closedCircleRoute, FIELD, openRoute, P, placeOnRoute, rotateAbout, routeAt, routeLength, SetBuilder, Show, smooth } from './lib';
import { arcPts, bandPolygon, batteryArc, bow, byAngle, form, registerLive, ringPts, SECTION_OF } from './forms';
import { bezierFormationPoints } from '../../src/bezierFormations';
import { generateFormation } from '../../src/formationGeometry';
import { generateScatter } from '../../src/scatterFormations';

// ---- cast -------------------------------------------------------------------------------------------------
const SECTIONS = [
  ['sec-sop', 'Sopranos', '#f6c445', 'S', 'Soprano', 24], ['sec-mel', 'Mellophones', '#f2873a', 'M', 'Mellophone', 16],
  ['sec-tbn', 'Trombones', '#e95b4f', 'TB', 'Trombone', 8], ['sec-bar', 'Baritones', '#c77dff', 'BR', 'Baritone', 8],
  ['sec-eup', 'Euphoniums', '#9a8cff', 'E', 'Euphonium', 12], ['sec-tub', 'Tubas', '#5c7cfa', 'T', 'Tuba', 16],
  ['sec-snr', 'Snares', '#3dd6c4', 'SD', 'Snare', 10], ['sec-ten', 'Tenors', '#2bb3a3', 'TD', 'Tenor', 5],
  ['sec-bas', 'Bass drums', '#1f8f84', 'BD', 'Bass', 5], ['sec-cym', 'Cymbals', '#98e6b8', 'CY', 'Cymbal', 4],
  ['sec-pit', 'Front ensemble', '#a6b0bf', 'FE', 'Front ensemble', 13],
  ['sec-flg', 'Guard · flags', '#f68ab8', 'F', 'Flag', 24], ['sec-rif', 'Guard · rifles', '#e9579f', 'R', 'Rifle', 12],
  ['sec-sab', 'Guard · sabres', '#c9378a', 'X', 'Sabre', 8],
] as const;
const PIT_NAMES = ['Synthesizer', 'Marimba 1', 'Vibraphone 1', 'Marimba 2', 'Vibraphone 2', 'Marimba 3', 'Timpani', 'Marimba 4', 'Vibraphone 3', 'Xylophone & crotales', 'Drum kit', 'Electric bass', 'Electric guitar'];
const performers: { id: string; label: string; name: string; sectionId: string }[] = [];
const ids: Record<string, string[]> = {};
for (const [sid, , , label, name, n] of SECTIONS) {
  ids[label] = [];
  for (let i = 1; i <= n; i++) {
    const id = `${sid.slice(4)}-${String(i).padStart(2, '0')}`;
    performers.push({ id, label: `${label}${i}`, sectionId: sid, name: label === 'FE' ? PIT_NAMES[i - 1] : `${name} ${i}` });
    ids[label].push(id); SECTION_OF[id] = sid;
  }
}
const { S, M, TB, BR, E, T: TU, SD, TD, BD, CY, FE, F: FL, R: RF, X: SB } = ids;
const S1 = S[0], TB1 = TB[0];
performers.find(p => p.id === S1)!.name = 'Soprano 1 · soloist';
performers.find(p => p.id === TB1)!.name = 'Trombone 1 · soloist';
const HB = [...S, ...M], LB = [...TB, ...BR, ...E, ...TU], BRASS = [...HB, ...LB];
const HB0 = HB.filter(id => id !== S1), LB0 = LB.filter(id => id !== TB1);
const BAT = { SD, TD, BD, CY }, BATTERY = [...SD, ...TD, ...BD, ...CY], GUARD = [...FL, ...RF, ...SB];
const without = (list: string[], ...out: string[]) => list.filter(id => !out.includes(id));

const C = P(50, 25);
const ell = (cx: number, cy: number, rx: number, ry: number): ScatterRegion => ({ kind: 'ellipse', vertices: [P(cx - rx, cy - ry), P(cx + rx, cy + ry)] });
const PIT_LINE = { center: P(50, 53), width: 48 };

// Route geometry shared by several moves.
const R_HORIZON = closedCircleRoute('route-horizon', 'Event horizon (guard)', P(50, 26), 31, 21.5, 90);
const R_DISC = closedCircleRoute('route-disc', 'Accretion disc (brass)', P(50, 25), 19, 14.5, 90);

/** Members evenly spaced on a closed route, sections as contiguous runs; returns the ordered conveyor list. */
function onRing(b: SetBuilder, name: string, route: SharedRoute, groups: string[][], phase = 0): string[] {
  const n = groups.reduce((k, g) => k + g.length, 0), L = routeLength(route);
  const pts = Array.from({ length: n }, (_, r) => routeAt(route, phase + r * L / n));
  form(b, name, groups, { pts, closed: true }, { live: false });
  const order = Array<string>(n);
  for (const id of groups.flat()) order[pts.findIndex(p => p === b.next[id])] = id;
  return order;
}

// Battery "core" inside the accretion disc (measures 14–20).
const CORE = { SD: bow(P(50, 31.5), 11, 1), TD: bow(P(50, 29.3), 6.4, .6), CY: bow(P(50, 20.5), 8, 1, 180) };
const SINGULARITY = { kind: 'circle' as const, center: P(50, 25), width: 3.4, height: 3.4 };
const SPIRAL = { pivot: P(50, 25.5), deg: -24, scale: .84 };
const unspiral = (p: Point) => { const q = P(SPIRAL.pivot.x + (p.x - SPIRAL.pivot.x) / SPIRAL.scale, SPIRAL.pivot.y + (p.y - SPIRAL.pivot.y) / SPIRAL.scale), a = -SPIRAL.deg * Math.PI / 180;
  return P(SPIRAL.pivot.x + (q.x - SPIRAL.pivot.x) * Math.cos(a) - (q.y - SPIRAL.pivot.y) * Math.sin(a), SPIRAL.pivot.y + (q.x - SPIRAL.pivot.x) * Math.sin(a) + (q.y - SPIRAL.pivot.y) * Math.cos(a)); };

// ---- virtual start (seeds the opening assignment so every star sits near its measure-14 spot) ---------------
const virtualStart: Record<string, Point> = {};
{
  const ringIds = [...E, ...TU, ...BR, ...without(TB, TB1), ...M, ...without(S, S1)];
  ringPts(P(50, 25), 19, 14.5, ringIds.length, 0).forEach((p, i) => { virtualStart[ringIds[i]] = unspiral(p); });
  for (const key of ['SD', 'TD', 'CY'] as const) bezierFormationPoints(smooth(CORE[key]), BAT[key].length).forEach((p, i) => { virtualStart[BAT[key][i]] = unspiral(p); });
  generateFormation('circle', 5, { ...SINGULARITY, rotation: 0, columns: 1 }).forEach((p, i) => { virtualStart[BD[i]] = unspiral(p); });
  GUARD.forEach((id, i) => { virtualStart[id] = routeAt(R_HORIZON, i * routeLength(R_HORIZON) / GUARD.length); });
  FE.forEach((id, i) => { virtualStart[id] = P(26 + i * 4, 53); });
  virtualStart[S1] = P(93, 49.5); virtualStart[TB1] = P(50, 44.5);
}
export const CAST = { sections: SECTIONS.map(([id, name, color]) => ({ id, name, color })), performers, virtualStart };

/** Split each section into side-1 and side-2 halves of where it stands now (keeps arms of open shapes contiguous). */
const sides = (b: SetBuilder, lists: string[][], x = 50) => lists.flatMap(l => [l.filter(id => b.prev[id].x < x), l.filter(id => b.prev[id].x >= x)]).filter(g => g.length);
const LBS = (soloist = false) => [soloist ? TB : without(TB, TB1), BR, E, TU], HBS = () => [without(S, S1), M];
function scatterForm(b: SetBuilder, name: string, groups: string[][], region: ScatterRegion, seed: string, spacing: number, sortCenter: Point, startDeg: number, distribution: 'uniform' | 'clustered' = 'uniform', pins: Record<string, Point> = {}) {
  const pinned = Object.keys(pins), n = groups.reduce((k, g) => k + g.length, 0) + pinned.length;
  const sc = generateScatter({ version: 1, seed, region, minimumSpacing: spacing, distribution, clusterStrength: .55 }, n, Object.fromEntries(pinned.map((id, i) => [i, pins[id]])), FIELD);
  pinned.forEach((id, i) => { b.next[id] = sc.points[i]; });
  form(b, name, groups, { pts: byAngle(sc.points.slice(pinned.length), sortCenter, startDeg), closed: false }, { live: false });
  const members = [...pinned, ...groups.flat()], slots = members.map(id => sc.points.indexOf(b.next[id]));
  const xs = sc.points.map(p => p.x), ys = sc.points.map(p => p.y);
  b.addLive(name, 'block', members, slots, { center: P((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), rotation: 0, columns: Math.max(1, Math.round(Math.sqrt(n))), assignment: 'position' }, { scatter: sc });
}
/** Concentric rings or arcs filled by angular sectors (sections stay radial neighbours of where they were). */
function sectorRings(b: SetBuilder, name: string, groups: string[][], rings: { r: [number, number]; n: number; a0?: number; a1?: number }[], c: Point, startDeg: number) {
  const shapes = rings.map(ring => ring.a0 === undefined ? ringPts(c, ring.r[0], ring.r[1], ring.n, -90) : arcPts(c, ring.r[0], ring.r[1], ring.a0, ring.a1!, ring.n));
  form(b, name, groups, { pts: byAngle(shapes.flat(), c, startDeg), closed: ring0Closed(rings) }, { live: false });
  return shapes;
}
const ring0Closed = (rings: { a0?: number }[]) => rings.every(r => r.a0 === undefined);
/** Live circle formations matching ringPts with start 90 (generateFormation circles start at the back, so rotate 180). */
function liveCircle(b: SetBuilder, name: string, c: Point, r: number, members: string[]) {
  const o = { center: c, width: 2 * r, height: 2 * r, rotation: 0, columns: 1, assignment: 'position' as const };
  const pts = generateFormation('circle', members.length, o);
  const placed = members.map(id => b.next[id]);
  const used = new Set<number>();
  const slots = placed.map(p => { let best = -1, bd = Infinity; pts.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (!used.has(i) && d < bd) { bd = d; best = i; } }); used.add(best); return best; });
  members.forEach((id, i) => { b.next[id] = pts[slots[i]]; });
  b.addLive(name, 'circle', members, slots, o);
}

const RULES: ProjectAnalysisRules = {
  defaults: { minimumSpacing: 1, maximumStride: 1.25 },
  sections: [
    ...['sec-sop', 'sec-mel', 'sec-tbn', 'sec-bar', 'sec-eup', 'sec-tub'].map(sectionId => ({ sectionId, maximumStride: 1.1, directions: { backward: { maximumStride: .8 } } })),
    ...['sec-snr', 'sec-ten', 'sec-bas', 'sec-cym'].map(sectionId => ({ sectionId, maximumStride: .9, directions: { backward: { maximumStride: .65 }, sideways: { maximumStride: .8 } } })),
    ...['sec-flg', 'sec-rif', 'sec-sab'].map(sectionId => ({ sectionId, minimumSpacing: 1.5, maximumStride: 1.8 })),
  ],
};

/** Places groups along an open route at even spacing from startDist (sections as runs); returns the follow-the-leader order
 * (leader = farthest along the route) and the leader's distance. */
function onRoute(b: SetBuilder, name: string, route: SharedRoute, groups: string[][], startDist: number, spacing: number, opt: { mix?: boolean } = {}) {
  const n = groups.reduce((k, g) => k + g.length, 0);
  const pts = Array.from({ length: n }, (_, k) => routeAt(route, startDist + k * spacing));
  form(b, name, groups, { pts }, { live: false, mix: opt.mix });
  const ids = groups.flat(), order = Array<string>(n);
  for (const id of ids) order[n - 1 - pts.indexOf(b.next[id])] = id;
  return { order, phase: startDist + (n - 1) * spacing, spacing };
}

/** The performer standing on each point (exact match). */
const whoIsOn = (b: SetBuilder, ids: string[], pts: Point[]) => pts.map(p => { const id = ids.find(i => Math.hypot(b.next[i].x - p.x, b.next[i].y - p.y) < 1e-9); if (!id) throw Error(`nobody on ${p.x},${p.y}`); return id; });

// ---- the show ---------------------------------------------------------------------------------------------
export function buildShow(show: Show) {
  const rehearsal: RehearsalPassage[] = [];
  const anchorCounts: number[] = [];
  let guardRing: string[] = [];

  // ===== I. EVENT HORIZON (counts 0–178) =====
  show.set('EH 1 · Starfield', 0, 'Darkness. The corps is a field of stars inside the event horizon the guard draws on the floor. Soprano 1 plays offstage at the side-2 front corner and stays outside the horizon for the whole movement. Front ensemble fixed on the front sideline for the whole show.', b => {
    b.shape('line', 'Front ensemble', FE, PIT_LINE);
    b.scatter('Starfield', without([...BRASS, ...BATTERY], S1, TB1), ell(50, 25.5, 25, 16.5), 'event-horizon', 2.8);
    guardRing = onRing(b, 'Horizon', R_HORIZON, [[...FL, ...RF, ...SB]]);
    b.at(S1, P(93, 49.5)); b.at(TB1, P(50, 44.5));
  });
  show.set('EH 2 · Accretion', 32, 'Measure 9, the heartbeat. The starfield turns and draws inward on spiral arcs (rotation with scaling keeps every interval proportional) while the horizon turns the other way.', b => {
    b.spiral(without([...BRASS, ...BATTERY], S1, TB1), SPIRAL.pivot, SPIRAL.deg, SPIRAL.scale);
    b.conveyor('Horizon turns', R_HORIZON, guardRing, .22, 1);
  });
  show.set('EH 3 · Accretion disc', 52, 'Measure 14, bass drum feature. Brass condense onto the accretion disc; basses form the singularity inside the battery core. Trombone 1 waits just outside the disc.', b => {
    const pts = Array.from({ length: 82 }, (_, r) => routeAt(R_DISC, r * routeLength(R_DISC) / 82));
    form(b, 'Accretion disc', [...LBS(), ...HBS()], { pts, closed: true }, { live: false });
    b.at(TB1, P(50, 42.5));
    form(b, 'Snares', [SD], { curve: CORE.SD }); form(b, 'Tenors', [TD], { curve: CORE.TD }); form(b, 'Cymbals', [CY], { curve: CORE.CY });
    b.shape('circle', 'Singularity', BD, SINGULARITY);
    b.conveyor('Horizon turns', R_HORIZON, guardRing, .4, 1, .22 * 32);
  });
  const discOrder = (() => { const L = routeLength(R_DISC); const at = show.cur; const order = Array<string>(82);
    for (const id of without(BRASS, S1, TB1)) { const r = Array.from({ length: 82 }, (_, k) => k).find(k => Math.hypot(routeAt(R_DISC, k * L / 82).x - at[id].x, routeAt(R_DISC, k * L / 82).y - at[id].y) < 1e-9)!; order[r] = id; } return order; })();
  show.set('EH 4 · The disc turns', 68, 'Measure 18, trombone solo. The disc and the horizon counter-rotate as conveyors; the singularity spins half a turn.', b => {
    b.conveyor('Disc rotation', R_DISC, discOrder, .55, 1);
    b.conveyor('Horizon counter-rotation', R_HORIZON, guardRing, .6, -1, .22 * 32 + .4 * 20);
    b.rotate(BD, SINGULARITY.center, 180);
  });
  show.set('EH 5 · Horizon opens', 80, 'Measure 21, backfield answers. The disc opens toward the soloist; the battery core starts forward through the opening. Guard opens its horizon to match.', b => {
    form(b, 'Open horizon', [[...LBS().flat(), ...HBS().flat()]], { curve: arcPts(P(50, 24), 21, 15.5, 110, 430, 13) });
    batteryArc(b, 'Battery', BAT, P(50, 36.3), 11);
    b.at(TB1, P(44, 45));
    form(b, 'Guard horizon', [GUARD], { curve: arcPts(P(50, 26), 31, 21.5, 116, 424, 13) });
    b.at(S1, P(87, 47.5));
  });
  show.set('EH 6 · Boil', 92, 'Measure 24. Brass boil in a clustered scatter that keeps the horseshoe; Trombone 1 rejoins early (6 counts, then holds) so the battery can pass through the opening to the front.', b => {
    scatterForm(b, 'Boil', [[...LBS().flat(), ...HBS().flat()]], { kind: 'polygon', vertices: bandPolygon(P(50, 24), [15, 10.5], [22.5, 16.5], 121, 419, 14) }, 'boil-24', 1.8, P(50, 24), 121, 'clustered', { [TB1]: P(38.5, 35.8) });
    batteryArc(b, 'Battery', BAT, P(50, 46.5), 11);
  });
  const IMPACT = P(50, 24);
  show.set('EH 7 · Impact', 104, 'Measure 27, impact hold. Everything collapses: brass slam into two rings around nothing; the guard tightens its horizon. Sections arrive in the same angular sectors they boiled in, so no paths cross.', b => {
    sectorRings(b, 'Impact', [[...LBS(true).flat(), ...HBS().flat()]], [{ r: [11, 11], n: 39 }, { r: [14.5, 14.5], n: 44 }], IMPACT, -90);
    const inner = without(BRASS, S1).filter(id => Math.abs(Math.hypot(b.next[id].x - IMPACT.x, b.next[id].y - IMPACT.y) - 11) < 1e-6);
    liveCircle(b, 'Impact inner ring', IMPACT, 11, inner); liveCircle(b, 'Impact outer ring', IMPACT, 14.5, without(BRASS, S1, ...inner));
    form(b, 'Guard horizon', [GUARD], { curve: arcPts(P(50, 24), 22, 18, 120, 420, 13) });
  });
  anchorCounts.push(104);
  show.set('EH 8 · Counter-rotation', 116, 'Measures 28–30: the 6/4 swell, drumline lick and front ensemble moment. Inner ring turns 20° one way, outer ring 20° the other, on circular arcs.', b => {
    const inner = without(BRASS, S1).filter(id => Math.abs(Math.hypot(b.prev[id].x - IMPACT.x, b.prev[id].y - IMPACT.y) - 11) < 1e-6);
    b.rotate(inner, IMPACT, 20); b.rotate(without(BRASS, S1, ...inner), IMPACT, -20);
  });
  show.set('EH 9 · Lament', 138, 'Measures 31–35, arriving on the open-sky 6/4. The rings release into an eye: low brass on the front lid, high brass on the back lid, battery anchoring the front. Guard opens wide.', b => {
    form(b, 'Eye · front', [LBS(true).flat()], { curve: [P(21, 26), P(34.5, 32.5), P(50, 35), P(65.5, 32.5), P(79, 26)] });
    form(b, 'Eye · back', [HBS().flat()], { curve: [P(22, 22), P(35.5, 15), P(50, 12.5), P(64.5, 15), P(78, 22)] });
    form(b, 'Guard horizon', [GUARD], { curve: arcPts(P(50, 25), 37, 23, 118, 422, 13) });
  });
  show.set('EH 10 · Drive', 148, 'Measure 37. The back lid straightens and drives forward.', b => {
    form(b, 'Eye · back', [HBS().flat()], { curve: [P(21, 21), P(35, 20), P(50, 20.5), P(65, 20), P(79, 21)] });
  });
  show.set('EH 11 · Final push', 158, 'Measure 40, into the final push at 41. Both lids bow toward the audience: two nested fronts.', b => {
    form(b, 'Front wall', [LBS(true).flat()], { curve: [P(17, 28), P(33, 35.5), P(50, 37.5), P(67, 35.5), P(83, 28)] });
    form(b, 'Second wall', [HBS().flat()], { curve: [P(22, 23.5), P(36, 27.5), P(50, 29), P(64, 27.5), P(78, 23.5)] });
  });
  show.set('EH 12 · Never resolves', 178, 'Measures 43–44, allargando into the held chord. The walls wind into one open spiral: low brass on the outer turn, high brass curling inside it. Neither end closes; the outer end points at Soprano 1, still outside.', b => {
    form(b, 'Open spiral', [LBS(true).flat(), HBS().flat()], { curve: [P(76, 33), P(70, 35.5), P(58, 38), P(45, 38), P(32, 35), P(22, 29), P(18, 21), P(20, 16), P(29, 11.5), P(42, 10), P(56, 11.5), P(66, 16), P(68, 22), P(63, 26.5)] });
    b.at(S1, P(84, 43));
  });
  anchorCounts.push(178);

  // ===== II. GRAVITY ASSIST (counts 178–552) =====
  const PLANET = P(50, 23.5);
  const ringSpec: [number, number, number, number][] = [[10, 6.4, 12, .62], [14.5, 9.3, 18, .52], [19, 12.2, 24, .44], [23.5, 15, 29, .38]];
  const orbits = ringSpec.map(([rx, ry, n, speed], i) => ({ name: `Orbit ${i + 1}`, n, speed, route: closedCircleRoute(`route-orbit-${i + 1}`, `Orbit ${i + 1}`, PLANET, rx, ry, 90 + 17 * i), order: [] as string[], phase: 0 }));
  const R_WELL = closedCircleRoute('route-well', 'Gravity well (guard)', P(50, 25.5), 38, 24, 90);
  const well = { order: [] as string[], phase: 0 };
  const spin = (b: SetBuilder, which: number[], wellSpeed = .5) => {
    for (const i of which) { const o = orbits[i]; b.conveyor(o.name, o.route, o.order, o.speed, 1, o.phase); o.phase += o.speed * b.counts; }
    if (wellSpeed) { b.conveyor('Gravity well', R_WELL, well.order, wellSpeed, -1, well.phase); well.phase -= wellSpeed * b.counts; }
  };
  show.set('GA 1 · Parking orbits', 194, 'Gravity Assist, measure 5. Brass settle on four orbits around the empty planet, evenly spaced so the dots read as orbital dust. Joint minimum-travel assignment, so no paths cross. The guard closes a wide gravity well around the whole system.', b => {
    const pts = orbits.flatMap(o => Array.from({ length: o.n }, (_, k) => routeAt(o.route, k * routeLength(o.route) / o.n)));
    form(b, 'Orbits', [without(BRASS, S1)], { pts }, { live: false });
    for (const o of orbits) { const L = routeLength(o.route); o.order = whoIsOn(b, without(BRASS, S1), Array.from({ length: o.n }, (_, k) => routeAt(o.route, k * L / o.n))); }
    well.order = onRing(b, 'Gravity well', R_WELL, [GUARD]);
  });
  anchorCounts.push(194);
  show.set('GA 2 · Orbit climbs I', 202, 'Measure 7. The two inner orbits start to turn (conveyors; inner orbits run faster); the well turns the other way.', b => spin(b, [0, 1]));
  show.set('GA 3 · Orbit climbs II', 210, 'Measure 9. The third orbit joins.', b => spin(b, [0, 1, 2]));
  show.set('GA 4 · Rise', 218, 'Measure 11. All four orbits turn at their own speeds.', b => spin(b, [0, 1, 2, 3]));
  show.set('GA 5 · Drumline break', 226, 'Measures 12–13. The system keeps turning through the drumline break into the theme.', b => spin(b, [0, 1, 2, 3]));
  show.set('GA 6 · Theme', 238, 'Measures 13–15. Theme statement over the full orbiting system.', b => spin(b, [0, 1, 2, 3], .45));
  const R_A = openRoute('route-wave-a', 'Wave A (back)', [P(16, 22), P(28, 14), P(42, 16), P(54, 24), P(66, 26), P(78, 19), P(86, 17)]);
  const R_B = openRoute('route-wave-b', 'Wave B (front)', [P(16, 30), P(28, 22), P(42, 24), P(54, 32), P(66, 34), P(78, 27), P(86, 25)]);
  const flow = { A: { order: [] as string[], phase: 0, spacing: 1.62 }, B: { order: [] as string[], phase: 0, spacing: 1.45 } };
  const wellSpin = (b: SetBuilder, speed: number) => { b.conveyor('Gravity well', R_WELL, well.order, speed, -1, well.phase); well.phase -= speed * b.counts; };
  show.set('GA 7 · Waves', 258, 'Measure 21, the corps cuts and the front ensemble circles. Brass leave orbit onto two parallel waves (joint minimum-travel assignment from the orbits). The well keeps turning.', b => {
    const brass = without(BRASS, S1), ptsA = Array.from({ length: 39 }, (_, k) => routeAt(R_A, 1 + k * flow.A.spacing)), ptsB = Array.from({ length: 44 }, (_, k) => routeAt(R_B, .5 + k * flow.B.spacing));
    form(b, 'Waves', [brass], { pts: [...ptsA, ...ptsB] }, { live: false });
    flow.A.order = whoIsOn(b, brass, ptsA); flow.A.phase = 1;
    flow.B.order = whoIsOn(b, brass, ptsB); flow.B.phase = .5;
    wellSpin(b, .4); b.at(S1, P(91, 36));
  });
  const slide = (b: SetBuilder, speed: number, cues?: { count: number; direction: -1 | 0 | 1 }[]) => {
    for (const [key, route] of [['A', R_A], ['B', R_B]] as const) { const f = flow[key]; f.phase += b.conveyor(`Wave ${key} flow`, route, f.order, speed, cues ?? 1, f.phase, f.spacing); }
  };
  show.set('GA 8 · Tenor feature', 274, 'Measure 25. Both waves flow toward side 2 along their own shared routes (open-route conveyors: everyone keeps the same interval).', b => { slide(b, .3); wellSpin(b, .4); });
  show.set('GA 9 · Calls and answers', 290, 'Measure 29: front ensemble calls, battery answers. The flow continues.', b => { slide(b, .22); wellSpin(b, .4); b.at(S1, P(92, 24)); });
  const triple = [{ c: P(40.5, 42.5), r: 2.9 }, { c: P(50, 38.6), r: 2.9 }, { c: P(59.5, 42.5), r: 2.9 }]
    .map((t, i) => ({ ...t, route: closedCircleRoute(`route-battery-${i + 1}`, `Battery orbit ${i + 1}`, t.c, t.r, t.r, 90), order: [] as string[], phase: 0 }));
  const batteryHome: Record<string, Point> = {};
  show.set('GA 10 · Battery orbit of three', 306, 'Measure 33. The battery splits into three orbiting circles (joint minimum-travel assignment); brass waves creep.', b => {
    const pts = triple.flatMap(t => Array.from({ length: 8 }, (_, k) => routeAt(t.route, k * routeLength(t.route) / 8)));
    BATTERY.forEach(id => { batteryHome[id] = b.prev[id]; });
    form(b, 'Battery orbits', [BATTERY], { pts }, { live: false });
    triple.forEach((t, i) => { t.order = whoIsOn(b, BATTERY, pts.slice(i * 8, i * 8 + 8)); });
    slide(b, .12); wellSpin(b, .4);
  });
  show.set('GA 11 · Stabs', 322, 'Measure 37, brass stabs. The battery circles spin (one full revolution over this move and the next); the waves move in stop-go pulses (direction cues: two counts go, two counts stop).', b => {
    triple.forEach((t, i) => { const dir = i === 1 ? -1 : 1, v = routeLength(t.route) / 32 * .99999; b.conveyor(`Battery orbit ${i + 1}`, t.route, t.order, v, dir, t.phase); t.phase += dir * v * b.counts; });
    slide(b, .3, [0, 2, 4, 6, 8, 10, 12, 14].map((count, i) => ({ count, direction: (i % 2 ? 0 : 1) as 0 | 1 })));
    wellSpin(b, .4);
  });
  const G = P(50, 22.5);
  show.set('GA 12 · Gravity takes hold', 338, 'Measure 41. The waves wind inward on spiral arcs toward the planet; the battery orbits keep turning.', b => {
    b.spiral(without(BRASS, S1), G, 24, .82);
    triple.forEach((t, i) => { const dir = i === 1 ? -1 : 1, v = routeLength(t.route) / 32 * .99999; b.conveyor(`Battery orbit ${i + 1}`, t.route, t.order, v, dir, t.phase); t.phase += dir * v * b.counts; });
    wellSpin(b, .5); b.at(S1, P(92, 14));
  });
  show.set('GA 13 · Slingshot', 354, 'Measure 45, impact. The system whips back out (spiral release), the well spins faster, and the battery, back where its orbits began, returns along the same lines to its arc.', b => {
    b.spiral(without(BRASS, S1), G, -12, 1.16);
    BATTERY.forEach(id => b.at(id, batteryHome[id]));
    wellSpin(b, .8);
  });
  anchorCounts.push(354);
  show.set('GA 14 · Mellophone feature', 378, 'Measures 47–50. The whole system drifts a quarter turn back (rigid rotation on arcs) under the mellophone feature.', b => {
    b.rotate(without(BRASS, S1), G, -14);
    wellSpin(b, .4);
  });
  const CR = P(50, 40);
  const cradle = (r: number[], a0: number, a1: number, n: number[]) => r.flatMap((rad, i) => arcPts(CR, rad, rad, a0, a1, n[i]));
  const moonsAt = [P(24, 8), P(76, 8), P(26, 45), P(74, 45)];
  show.set('GA 15 · Cradle', 394, 'Measure 55, sopranos and trombone. Brass settle into three arcs that cradle the battery, the planet now in front. The well breaks into four guard moons in the corners.', b => {
    form(b, 'Cradle', [without(BRASS, S1)], { pts: cradle([15, 20, 25], 205, 335, [21, 27, 35]) }, { live: false });
    const moonPts = moonsAt.map(c => generateFormation('circle', 11, { center: c, width: 7.4, height: 7.4, rotation: 0, columns: 1 }));
    form(b, 'Moons', [GUARD], { pts: moonPts.flat() }, { live: false });
    moonPts.forEach((pts, q) => registerLive(b, `Moon ${q + 1}`, 'circle', { center: moonsAt[q], width: 7.4, height: 7.4 }, whoIsOn(b, GUARD, pts)));
    b.at(S1, P(91, 30));
  });
  show.set('GA 16 · Closest approach', 418, 'Measure 61, the 6/4 hold. Brass close in around the planet (spiral arcs about the battery).', b => {
    b.spiral(without(BRASS, S1), CR, 0, .8);
  });
  show.set('GA 17 · Snap', 424, 'Measure 62. A small, sharp release.', b => { b.spiral(without(BRASS, S1), CR, 0, 1.12); });
  const inner2 = () => without(BRASS, S1).filter(id => Math.hypot(show.cur[id].x - CR.x, show.cur[id].y - CR.y) < 15);
  show.set('GA 18 · Canon', 444, 'Measures 63–66, sopranos and low brass a bar apart. The inner arc turns 20° first; the outer arcs make the same turn one bar (4 counts) later. Scheduled paths: arc then hold, or hold then arc. The front moons drift outward to make room.', b => {
    const first = inner2(), second = without(BRASS, S1, ...first);
    b.shift(GUARD.filter(id => b.prev[id].y > 30 && b.prev[id].x < 50), -8, -2); b.shift(GUARD.filter(id => b.prev[id].y > 30 && b.prev[id].x >= 50), 8, -2);
    for (const id of first) { b.at(id, rotateAbout(b.prev[id], CR, 20)); const a = arcPath(b.prev[id], CR, 20, 12)!; b.schedule(id, [{ ...a.segments[0], endCount: 12 } as PathSegment, { id: 'hold', kind: 'hold', startCount: 12, endCount: 16 }]); }
    for (const id of second) { b.at(id, rotateAbout(b.prev[id], CR, 20)); const a = arcPath(b.prev[id], CR, 20, 12)!; b.schedule(id, [{ id: 'wait', kind: 'hold', startCount: 0, endCount: 4 }, { ...a.segments[0], startCount: 4, endCount: 16 } as PathSegment]); }
  });
  show.set('GA 19 · Shout', 460, 'Measures 67–70, lead guitar solo into the shout. The cradle swings back past center and opens wider (spiral arcs about the battery).', b => {
    b.spiral(without(BRASS, S1), CR, -32, 1.12);
  });
  show.set('GA 20 · Swing', 476, 'Measures 71–74. The arcs swing back toward center.', b => { b.rotate(without(BRASS, S1), CR, 14); });
  const tradeRegion = { kind: 'polygon' as const, vertices: [P(16, 30), P(20, 14), P(34, 6), P(66, 6), P(80, 14), P(84, 30), P(70, 33), P(50, 31), P(30, 33)] };
  show.set('GA 21 · Trade', 492, 'Measure 79, trading phrases. The arcs shatter into a scatter of debris behind the battery (seeded scatter, joint assignment).', b => {
    b.scatter('Debris', without(BRASS, S1), tradeRegion, 'trade-79', 2.2);
  });
  show.set('GA 22 · Planet pulls', 508, 'Measure 83. The debris field is pulled toward the planet: the whole scatter turns and contracts on spiral arcs.', b => {
    b.spiral(without(BRASS, S1), CR, 18, .86);
    b.at(S1, P(91, 46));
  });
  const BOW = P(50, 52);
  show.set('GA 23 · C7♭9', 524, 'Measure 87, the big chord. Brass open into two wide bows around the battery and the front ensemble.', b => {
    form(b, 'Bows', [without(BRASS, S1)], { pts: [...arcPts(BOW, 26.5, 26.5, 210, 330, 39), ...arcPts(BOW, 31.5, 31.5, 208, 332, 44)] }, { live: false });
    b.at(S1, P(80, 51));
  });
  anchorCounts.push(524);
  show.set('GA 24 · Captured', 540, 'Measures 89–91. The bows close into one captured orbit; the moons drift in. Into the Tether transition.', b => {
    form(b, 'Captured orbit', [without(BRASS, S1)], { kind: 'circle', center: P(50, 24), width: 50, height: 28 });
    b.at(S1, P(66, 51));
  });

  // ===== III. TETHER (counts 552–844) =====
  const SOLO = P(50, 50);
  const guardCorners = [P(12, 6.5), P(88, 6.5), P(18, 42), P(82, 42)];
  const brass83 = without(BRASS, S1);
  show.set('TE 1 · Alone', 556, 'Tether, measure 2. Soprano 1 alone at the front, in front of the battery. Brass frozen in a wide scatter; the guard moons settle into four kneeling clusters in the corners.', b => {
    b.scatter('Frozen', brass83, { kind: 'polygon', vertices: [P(23, 33), P(21, 20), P(30, 13), P(38, 7), P(62, 7), P(70, 13), P(79, 20), P(77, 33), P(64, 37), P(50, 36), P(36, 37)] }, 'tether-frozen', 2.4);
    const sc = guardCorners.map((c, i) => generateScatter({ version: 1, seed: `tether-guard-${i + 1}`, region: ell(c.x, c.y, 5.5, 5), minimumSpacing: 2, distribution: 'uniform', clusterStrength: .5 }, 11, {}, FIELD).points);
    form(b, 'Kneeling', [GUARD], { pts: sc.flat() }, { live: false });
    b.at(S1, P(55, 50.5));
  });
  anchorCounts.push(556);
  show.set('TE 2 · Breath', 600, 'Measure 13, high brass rise. The frozen scatter breathes: one slow turn and contraction on spiral arcs over twelve measures. Soprano 1 settles front and center.', b => {
    b.spiral(brass83, P(50, 20), 6, .95); b.at(S1, SOLO);
  });
  const R_TETHER = openRoute('route-tether', 'The tether', [P(41, 44), P(36, 38), P(30, 31), P(26, 24), P(30, 17), P(40, 13), P(50, 16), P(58, 23), P(66, 28), P(74, 24), P(76, 16), P(70, 9.5), P(60, 6), P(48, 5), P(36, 5.5)]);
  const tether = { order: [] as string[], phase: 0, spacing: 1.5 };
  show.set('TE 3 · Tether', 644, 'Measure 23, the theme. The brass draw out into one long cable that leaves from beside the battery and snakes through the field (a single shared route).', b => {
    const pts = Array.from({ length: 83 }, (_, k) => routeAt(R_TETHER, 6 + k * tether.spacing));
    form(b, 'Tether', [brass83], { pts }, { live: false });
    tether.order = whoIsOn(b, brass83, pts); tether.phase = 6;
  });
  const R_DUET = openRoute('route-duet', 'Rifle duet', [P(19, 2.5), P(25, 2.5), P(31, 2.5)]);
  let duet: string[] = [];
  const duetHome: Point[] = [];
  show.set('TE 4 · Reel in', 664, 'Measure 29, the general pause. The cable reels toward the soloist, follow the leader: every member traces the exact path of the one ahead, then freezes on the G.P. Two rifles slide out along the back sideline from the side-1 back cluster for a duet.', b => {
    b.follow('Reel in', R_TETHER, tether.order, .22, tether.spacing / .22, tether.phase, 'follow', [{ count: 0, direction: -1 }]);
    duet = [...RF].sort((u, v) => Math.hypot(b.prev[u].x - 16, b.prev[u].y - 2) - Math.hypot(b.prev[v].x - 16, b.prev[v].y - 2)).slice(0, 2);
    duet.forEach(id => duetHome.push(b.prev[id]));
    b.at(duet[0], routeAt(R_DUET, 7)); b.at(duet[1], routeAt(R_DUET, 5));
    // Anyone standing within reach of the duet's exit lines steps aside to the nearest clear dot.
    const segDist = (p: Point, u: Point, v: Point) => { const dx = v.x - u.x, dy = v.y - u.y, t = Math.max(0, Math.min(1, ((p.x - u.x) * dx + (p.y - u.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(p.x - u.x - t * dx, p.y - u.y - t * dy); };
    const lines = duet.map(id => [b.prev[id], b.next[id]] as const), others = without(GUARD, ...duet);
    for (const id of others) {
      if (lines.every(([u, v]) => segDist(b.prev[id], u, v) >= 2.2)) continue;
      const cands = [1.5, 2, 2.5, 3].flatMap(r => Array.from({ length: 16 }, (_, k) => P(b.prev[id].x + r * Math.cos(k * Math.PI / 8), b.prev[id].y + r * Math.sin(k * Math.PI / 8))));
      const ok = cands.find(c => c.y > .5 && c.x > .5 && lines.every(([u, v]) => segDist(c, u, v) >= 2.2) && others.every(o => o === id || Math.hypot(b.next[o].x - c.x, b.next[o].y - c.y) >= 1.9));
      if (ok) { b.at(id, ok); b.schedule(id, [{ id: 'aside', kind: 'line', startCount: 0, endCount: 6 }, { id: 'clear', kind: 'hold', startCount: 6, endCount: b.counts }]); }
    }
    duet.forEach(id => b.schedule(id, [{ id: 'wait', kind: 'hold', startCount: 0, endCount: 6 }, { id: 'out', kind: 'line', startCount: 6, endCount: b.counts }]));
  });
  const LAYER = P(50, 36);
  show.set('TE 5 · Layers', 700, 'Measure 38. Trombone 1 steps out front-left for the solo; the rest of the brass stack into three layered arcs in the backfield. TEACHING FINDING: the rifle duet on the back sideline counter-marches (group movement with a reverse cue at count 8). Squidware models both rifles on one line, so the pair is flagged as a collision where they pass, around count 675. On the field they pass shoulder to shoulder, one step apart; leave this finding as a reminder of what the counter-march model does and does not show.', b => {
    b.follow('Rifle duet counter-march', R_DUET, duet, .3, 2 / .3, 7, 'countermarch', [{ count: 0, direction: 1 }, { count: 8, direction: -1 }]);
    const rest = without(brass83, TB1);
    form(b, 'Layers', [rest], { pts: [...arcPts(LAYER, 16, 16, 208, 332, 21), ...arcPts(LAYER, 21, 21, 206, 334, 27), ...arcPts(LAYER, 26, 26, 204, 336, 34)] }, { live: false });
    b.at(TB1, P(36, 45));
  });
  show.set('TE 6 · Accelerando', 732, 'Measure 46. The layers drift toward the audience as the tempo pushes. The rifle duet slides back into its cluster (the counter-march swapped their order, so they swap home dots).', b => {
    b.spiral(without(brass83, TB1), LAYER, 0, .82);
    b.at(duet[0], duetHome[1]); b.at(duet[1], duetHome[0]);
  });
  show.set('TE 7 · Boiling', 764, 'Measure 54. The layers boil apart into a clustered scatter; Trombone 1 folds back in.', b => {
    b.scatter('Boiling', brass83, { kind: 'polygon', vertices: [P(18, 30), P(22, 14), P(36, 7), P(64, 7), P(78, 14), P(82, 30), P(64, 36), P(36, 36)] }, 'tether-boil', 2.1, 'clustered');
  });
  show.set('TE 8 · Turn to the front', 770, 'Measures 56–58. Brass turn front and press forward toward the chorus; Soprano 1 waits at the front.', b => {
    b.shift(brass83, 0, 3);
  });
  show.set('TE 9 · Chorus', 792, 'Measure 61, the full-corps chorus. Two long fronts sweep across the field above the battery; the guard rises at the ends.', b => {
    form(b, 'Chorus front', [brass83], { pts: [...bezierFormationPoints(smooth([P(15, 30), P(30.5, 35.5), P(50, 37.5), P(69.5, 35.5), P(85, 30)]), 42), ...bezierFormationPoints(smooth([P(18, 26.5), P(32.5, 31.8), P(50, 33.7), P(67.5, 31.8), P(82, 26.5)]), 41)] }, { live: false });
  });
  show.set('TE 10 · Sustain', 828, 'Measure 70. The fronts open a little wider as the chord sustains.', b => { b.spiral(brass83, P(50, 34), 0, 1.04); });
  show.set('TE 11 · Let go', 844, 'End of Tether. The fronts drift away from the soloist, the tether let go; Soprano 1 starts back toward the corps.', b => { b.shift(brass83, 0, -3); b.at(S1, P(61, 46.5)); });
  anchorCounts.push(844);

  // ===== IV. REENTRY (counts 844–1226) =====
  const poly = (...v: Point[]) => ({ kind: 'polygon' as const, vertices: v });
  show.set('RE 1 · Cold', 864, 'Reentry, measures 4–6: low brass feature. The fronts split into two cold scatter wings, leaving a corridor down the middle. Soprano 1 rejoins the corps on a pinned dot in the side-2 wing.', b => {
    const L = generateScatter({ version: 1, seed: 'reentry-left', region: poly(P(14, 34), P(16, 20), P(28, 14), P(42.5, 14), P(43, 36)), minimumSpacing: 2.4, distribution: 'uniform', clusterStrength: .5 }, 42, {}, FIELD);
    const R = generateScatter({ version: 1, seed: 'reentry-right', region: poly(P(57, 36), P(57.5, 14), P(72, 14), P(84, 20), P(86, 34)), minimumSpacing: 2.4, distribution: 'uniform', clusterStrength: .5 }, 42, { 0: P(62, 34.5) }, FIELD);
    b.at(S1, R.points[0]);
    form(b, 'Cold wings', [brass83], { pts: [...L.points, ...R.points.slice(1)] }, { live: false });
    batteryArc(b, 'Battery', BAT, P(50, 38), 11);
  });
  anchorCounts.push(864);
  const CORE2 = P(50, 18);
  show.set('RE 2 · Double time', 888, 'Measure 12, double time. The battery turns and walks up the corridor to center (declared forward march), assembling as basses, then tenors and snares, enter.', b => {
    batteryArc(b, 'Battery', BAT, CORE2, 11);
    b.direction(BATTERY, 'forward');
  });
  const STREAKS = [[P(23, 14), P(28.5, 19), P(34.5, 25.5), P(40, 32), P(44, 39.5)], [P(28, 4), P(32, 8), P(36.5, 13.5), P(41, 20), P(45, 26.5), P(48, 33.5)]];
  const streakPts = [...STREAKS, ...STREAKS.map(l => l.map(p => P(100 - p.x, p.y)))];
  const streaks = streakPts.map((pts, i) => ({ route: openRoute(`route-streak-${i + 1}`, `Streak ${i + 1}`, pts), order: [] as string[], phase: 0 }));
  show.set('RE 3 · Streaks', 920, 'Measure 20, snares in. The wings stretch into four burning streaks that converge toward the audience like a chevron.', b => {
    const pts = streaks.flatMap(st => Array.from({ length: 21 }, (_, k) => routeAt(st.route, .2 + k * 1.45)));
    form(b, 'Streaks', [BRASS], { pts }, { live: false });
    streaks.forEach((st, i) => { st.order = whoIsOn(b, BRASS, pts.slice(i * 21, i * 21 + 21)); st.phase = .2; });
  });
  show.set('RE 4 · Drumline feature', 948, 'Measure 27, drumline feature. The streaks burn down their routes toward the audience (open-route conveyors).', b => {
    streaks.forEach((st, i) => { st.phase += b.conveyor(`Streak ${i + 1} burns`, st.route, st.order, .14, 1, st.phase, 1.45); });
  });
  const SHIELD = P(50, 8);
  show.set('RE 5 · Heat shield', 980, 'Measure 35. Brass fold into a double heat shield bowed toward the audience, the battery sheltered behind it; the guard forms the outer shell.', b => {
    form(b, 'Heat shield', [BRASS], { pts: [...arcPts(SHIELD, 28, 28, 22, 158, 42), ...arcPts(SHIELD, 33, 33, 20, 160, 42)] }, { live: false });
    form(b, 'Outer shell', [GUARD], { pts: arcPts(SHIELD, 39.5, 39.5, 28, 152, 44) }, { live: false });
  });
  show.set('RE 6 · Buffet', 996, 'Measure 39. The shield buffets one way (rigid rotation on arcs)…', b => { b.rotate(BRASS, SHIELD, 8); b.rotate(GUARD, SHIELD, -6); });
  show.set('RE 7 · Buffet back', 1012, 'Measure 43. …and back the other way.', b => { b.rotate(BRASS, SHIELD, -14); b.rotate(GUARD, SHIELD, 10); });
  show.set('RE 8 · Build', 1028, 'Measure 47, the build. Pressure: the shield compresses toward the battery on spiral arcs.', b => { b.spiral(BRASS, SHIELD, 6, .86); b.spiral(GUARD, SHIELD, -4, .94); });
  show.set('RE 9 · Cutoff', 1040, 'Measures 49–50. Brass turn front and close a last step in; cutoff.', b => { b.spiral(BRASS, SHIELD, 0, .96); });
  show.set('RE 10 · Silence', 1048, 'Measure 51. Silence: nobody moves.', () => {});
  anchorCounts.push(1048);
  show.set('RE 11 · Impact', 1056, 'Measure 52, impact. The shield shatters into fragments (scatter seeded inside a band around the old shield).', b => {
    b.scatter('Fragments', BRASS, poly(...bandPolygon(SHIELD, [16, 16], [33, 33], 16, 164, 14)), 'reentry-impact', 2.3);
  });
  const CORNERS = [P(8, 6), P(92, 6), P(8, 44), P(92, 44)];
  show.set('RE 12 · Debris field', 1080, 'Measure 60. The fragments drift outward and turn (spiral release); the guard runs to the four corners.', b => {
    b.spiral(BRASS, SHIELD, -10, 1.03);
    const byAng = [...GUARD].sort((u, v) => Math.atan2(b.prev[u].y - SHIELD.y, b.prev[u].x - SHIELD.x) - Math.atan2(b.prev[v].y - SHIELD.y, b.prev[v].x - SHIELD.x));
    const sizes = [4, 18, 18, 4], radius = [1.6, 5.6, 5.6, 1.6];
    [1, 3, 2, 0].reduce((at, corner, k) => { form(b, `Corner ${corner + 1}`, [byAng.slice(at, at + sizes[k])], { kind: 'circle', center: CORNERS[corner], width: 2 * radius[k], height: 2 * radius[k] }); return at + sizes[k]; }, 0);
  });
  const SUSP = P(50, 31);
  const R_SUSP = closedCircleRoute('route-suspension', 'Suspension ring', SUSP, 27, 9, 90);
  show.set('RE 13 · Suspension', 1108, 'Measure 67, suspension. Brass gather onto one wide floating ring in front of the battery.', b => { onRing(b, 'Suspension', R_SUSP, [BRASS]); });
  show.set('RE 14 · Release', 1116, 'Measure 69, release. The ring breathes outward on spiral arcs (the mellophones hold their horns still through it).', b => { b.spiral(BRASS, SUSP, 0, 1.06); });
  show.set('RE 15 · Stabs', 1156, 'Measures 71–78, stabs. The ring turns in four hits: a cubic arc for two counts, then a hold, four times (scheduled paths).', b => {
    for (const id of BRASS) {
      const segs: PathSegment[] = [];
      let at = b.prev[id];
      for (let k = 0; k < 4; k++) {
        const nextP = rotateAbout(b.prev[id], SUSP, 4 * (k + 1)), arc = arcPath(at, SUSP, 4, 2);
        segs.push({ ...(arc ? arc.segments[0] : { id: 'go', kind: 'line', startCount: 0, endCount: 2 }), id: `hit${k}`, startCount: k * 8, endCount: k * 8 + 2, ...(k < 3 ? { to: nextP } : {}) } as PathSegment);
        segs.push({ id: `set${k}`, kind: 'hold', startCount: k * 8 + 2, endCount: k * 8 + 8 });
        at = nextP;
      }
      b.at(id, rotateAbout(b.prev[id], SUSP, 16)); b.schedule(id, segs);
    }
  });
  const gears = [P(20, 30), P(37, 34), P(63, 34), P(80, 30)].map((c, i) => ({ c, route: closedCircleRoute(`route-gear-${i + 1}`, `Gear ${i + 1}`, c, 5.4, 5.4, 90), order: [] as string[], phase: 0 }));
  show.set('RE 16 · Gears', 1172, 'Measures 79–82, ostinato. Brass break into four interlocking gears.', b => {
    const pts = gears.flatMap(g => Array.from({ length: 21 }, (_, k) => routeAt(g.route, k * routeLength(g.route) / 21)));
    form(b, 'Gears', [BRASS], { pts }, { live: false });
    gears.forEach((g, i) => { g.order = whoIsOn(b, BRASS, pts.slice(i * 21, i * 21 + 21)); });
  });
  show.set('RE 17 · Turning', 1188, 'Measures 83–86. The gears turn against each other (conveyors in alternating directions); the battery steps up behind them.', b => {
    gears.forEach((g, i) => { const dir = i % 2 ? -1 : 1; b.conveyor(`Gear ${i + 1}`, g.route, g.order, .45, dir, g.phase); g.phase += dir * .45 * b.counts; });
    batteryArc(b, 'Battery', BAT, P(50, 22), 11);
  });
  show.set('RE 18 · Company front', 1204, 'Measure 91, the last chord. Company front: every brass player on two lines across the field, the battery behind, the guard spinning in the corners.', b => {
    const front = Array.from({ length: 42 }, (_, k) => P(16 + k * 1.65, 44)), back = Array.from({ length: 42 }, (_, k) => P(16.8 + k * 1.65, 41.2));
    form(b, 'Company front', [BRASS], { pts: [...front, ...back] }, { live: false });
    registerLive(b, 'Company front · front line', 'line', { center: P(16 + 41 * 1.65 / 2, 44), width: 41 * 1.65 }, whoIsOn(b, BRASS, front));
    registerLive(b, 'Company front · second line', 'line', { center: P(16.8 + 41 * 1.65 / 2, 41.2), width: 41 * 1.65 }, whoIsOn(b, BRASS, back));
  });
  anchorCounts.push(1204);
  show.set('RE 19 · Release', 1214, 'Measures 93–94: the raised-fifth stab, then release. The company front takes two big steps toward the audience.', b => { b.shift(BRASS, 0, 2.5); });
  show.set('RE 20 · Hold', 1226, 'Measure 96. Hold to the end.', () => {});
  return finish(show, rehearsal, anchorCounts, duet);
}

function finish(show: Show, rehearsal: RehearsalPassage[], anchorCounts: number[], duet: string[]) {
  const set = (prefix: string) => { const found = show.sets.find(x => x.name.startsWith(prefix)); if (!found) throw Error(`no set ${prefix}`); return { kind: 'set' as const, setId: found.id }; };
  // Assignment constraints that record intent on the forms where it matters, always consistent with the stored mapping.
  for (const st of show.sets) for (const f of st.liveFormations ?? []) {
    const ids = f.members.map(m => m.performerId), slotOf = (id: string) => f.members.find(m => m.performerId === id)!.slot;
    if (f.name.startsWith('Company front')) {
      const solo = [S1, TB1].filter(id => ids.includes(id));
      f.assignmentConstraints = { pins: solo.map(id => ({ performerId: id, slot: slotOf(id) })), forbidden: [], sectionSlots: [], roleSlots: solo.map(id => ({ slot: slotOf(id), role: 'soloist' })).sort((a, b) => a.slot - b.slot),
        roles: Object.fromEntries(solo.map(id => [id, 'soloist'])), unknownRoles: 'allow', orderedGroups: [] };
    } else if (/(Battery|^Snares|^Tenors|^Cymbals)/.test(f.name) && ids.every(id => SECTION_OF[id] === SECTION_OF[ids[0]])) {
      const ordered = [...f.members].sort((a, b) => a.slot - b.slot);
      f.assignmentConstraints = { pins: [], forbidden: [], sectionSlots: ordered.map(m => ({ slot: m.slot, sectionId: SECTION_OF[ids[0]] })), roleSlots: [], roles: {}, unknownRoles: 'allow',
        orderedGroups: [{ id: `${f.id}-order`, name: 'Keep drum order', performerIds: ordered.map(m => m.performerId), slots: ordered.map(m => m.slot) }] };
    }
  }
  const passages: [string, string, string | undefined, RehearsalPassage['focus'], string][] = [
    ['Event Horizon', 'EH 1', 'EH 12', { kind: 'all' }, 'Opener: starfield to the unresolved spiral.'],
    ['Offstage soloist', 'EH 1', 'EH 3', { kind: 'performers', performerIds: [S1] }, 'Soprano 1 plays from outside the horizon.'],
    ['Trombone solo', 'EH 3', 'EH 6', { kind: 'performers', performerIds: [TB1] }, 'Trombone 1 waits outside the disc, solos at the opening, rejoins the boil early.'],
    ['Accretion disc & horizon', 'EH 2', 'EH 4', { kind: 'all' }, 'Spiral arcs, then two counter-rotating conveyors.'],
    ['Gravity Assist', 'GA 1', 'GA 24', { kind: 'all' }, 'Second movement: orbits, waves, slingshot, cradle, captured.'],
    ['Orbits climb', 'GA 1', 'GA 6', { kind: 'all' }, 'Four orbit conveyors join one by one; the guard well turns against them.'],
    ['Battery orbit of three', 'GA 9', 'GA 13', { kind: 'performers', performerIds: [...SD, ...TD, ...BD, ...CY] }, 'Three battery circles, one full revolution, then back along the same lines.'],
    ['Canon', 'GA 17', 'GA 18', { kind: 'all' }, 'Inner arc first, outer arcs one bar later.'],
    ['Tether', 'TE 1', 'TE 11', { kind: 'all' }, 'Ballad: soloist, the cable, the chorus.'],
    ['Rifle duet counter-march', 'TE 4', 'TE 5', { kind: 'performers', performerIds: duet }, 'The one deliberate finding in the show: see TE 5 notes.'],
    ['Reentry', 'RE 1', 'RE 20', { kind: 'all' }, 'Closer: streaks, heat shield, impact, gears, company front.'],
    ['Drumline feature', 'RE 2', 'RE 4', { kind: 'section', sectionId: 'sec-snr' }, 'Battery assembles in the corridor while the streaks burn.'],
    ['Company front', 'RE 17', 'RE 20', { kind: 'all' }, 'Gears to two full-width lines; release and hold.'],
  ];
  passages.forEach(([name, a, b, focus, notes], i) => rehearsal.push({ id: `passage-${i + 1}`, name, notes, start: set(a), ...(b ? { end: set(b) } : {}), focus }));
  const selectionGroups: SelectionGroup[] = [
    ['Soloists', [S1, TB1]], ['All brass', BRASS], ['High brass', HB], ['Low brass', LB], ['Battery', BATTERY], ['Front ensemble', FE], ['Color guard', GUARD], ['Rifle duet', duet],
  ].map(([name, performerIds], i) => ({ id: `group-${i + 1}`, name: name as string, performerIds: performerIds as string[] }));
  return { rehearsal, anchorCounts: [...new Set(anchorCounts)], selectionGroups, analysisRules: RULES };
}

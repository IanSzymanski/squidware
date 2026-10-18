import type { Point, Project } from './types';
import { coordinateDescription, coordinateReferences, type CoordinateFormat } from './coordinates';
import { DEFAULT_SNAPPING } from './snapping';

export type DrillUnit = 'steps' | 'yards';
export type EntryMode = 'absolute' | 'relative';
export interface DrillContext {
  stepsPerFive: 6 | 8 | 12;
  side: 1 | 2 | null;
  /** Missing units require an explicit caller-selected convention. */
  defaultUnit: DrillUnit | null;
}
export interface CoordinateEntryOptions { mode: EntryMode; text: string; side: 1 | 2 | null; defaultUnit: DrillUnit | null }
export interface CoordinateEntrySession { revision: number; setId: string; ids: string[]; options: CoordinateEntryOptions }
export type ParsedDrillEntry = { mode: 'absolute'; point: Point } | { mode: 'relative'; delta: Point };
export interface CoordinateEntryResult {
  positions: Record<string, Point>; updates: Record<string, Point>; parsed: ParsedDrillEntry | null;
  changed: boolean; error: string | null;
}
export const DRILL_ENTRY_LIMIT = 240;
export function validateCoordinateEntryOptions(input: unknown): CoordinateEntryOptions {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Coordinate entry requires mode, text, side and unit settings.');
  const value=input as Record<string,unknown>;
  if (!['absolute','relative'].includes(value.mode as string) || typeof value.text !== 'string' || ![null,1,2].includes(value.side as number|null) || ![null,'steps','yards'].includes(value.defaultUnit as string|null)) throw new Error('Coordinate entry requires a supported mode, text string, side and bare-number unit.');
  return {mode:value.mode,text:value.text,side:value.side,defaultUnit:value.defaultUnit} as CoordinateEntryOptions;
}
const number = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`;
const unitPattern = '(steps?|yards?|yds?)';
const referencePattern = `(?:goal line|${number}(?:[- ]?yard line)?)`;
const onHorizontal = new RegExp(`^on (?:the )?(${referencePattern})$`);
const offsetHorizontal = new RegExp(`^(${number})(?: ${unitPattern})? (inside|outside) (?:the )?(${referencePattern})$`);
const onVertical = /^(?:on )?(?:the )?((?:front|back) (?:hash|sideline))$/;
const offsetVertical = new RegExp(`^(${number})(?: ${unitPattern})? (behind|in front of) (?:the )?((?:front|back) (?:hash|sideline))$`);
const relativeClause = new RegExp(`^(${number})(?: ${unitPattern})? (forward|front|backward|back|left|right|toward (?:the )?(?:front sideline|back sideline|side [12]))$`);

function clean(input: string, context: DrillContext): string {
  if (typeof input !== 'string' || input.length > DRILL_ENTRY_LIMIT) throw new Error(`Use a phrase of at most ${DRILL_ENTRY_LIMIT} characters.`);
  if (!input.trim()) throw new Error('Enter a coordinate or movement phrase to preview.');
  if (![6,8,12].includes(context.stepsPerFive) || ![null,1,2].includes(context.side) || ![null,'steps','yards'].includes(context.defaultUnit)) throw new Error('Choose an explicit side, unit convention and supported production step size.');
  return input.trim().toLowerCase().replace(/\s+/g,' ');
}
function distance(amount: string, unit: string | undefined, context: DrillContext): number {
  const basis = unit ? unit.startsWith('step') ? 'steps' : 'yards' : context.defaultUnit;
  if (!basis) throw new Error('Units are missing. Write steps or yards, or choose the bare-number unit explicitly.');
  const value = Number(amount);
  if (!Number.isFinite(value) || value > 1e6) throw new Error('Use a finite distance from 0 to 1000000.');
  return value * (basis === 'steps' ? 5 / context.stepsPerFive : 1);
}

/** Strict grammar: no inferred side, hash, omitted axis, facing, or discarded trailing words. */
export function parseDrillCoordinate(input: string, field: Project['field'], context: DrillContext): Point {
  const text = clean(input,context);
  const clauses = text.split(/\s*[,;]\s*/);
  if (clauses.length !== 2 || clauses.some(part=>!part)) throw new Error('Give both axes: Side 1: 4 outside the 40; 6 behind front hash.');
  const prefix = /^(?:side ([12])\s*:\s*)?(.+)$/.exec(clauses[0])!;
  const inlineSide = prefix[1] ? Number(prefix[1]) as 1 | 2 : null;
  if (inlineSide && context.side && inlineSide !== context.side) throw new Error('The phrase side conflicts with the selected side. Choose From phrase or use the same side.');
  const side = inlineSide ?? context.side; const horizontal = prefix[2];
  const on = onHorizontal.exec(horizontal); const offset = offsetHorizontal.exec(horizontal);
  if (!on && !offset) throw new Error('Use on the 40-yard line, or 4 steps inside/outside the 40, with an explicit side.');
  const reference = on?.[1] ?? offset![4];
  const line = reference === 'goal line' ? 0 : Number.parseFloat(reference);
  const half = field.width / 2;
  if (!Number.isFinite(line) || line < 0 || line > half) throw new Error(`The yard-line reference must be from 0 to ${half}, measured from a goal line.`);
  const amount = offset ? distance(offset[1],offset[2],context) : 0;
  const fromGoal = line + (offset?.[3] === 'outside' ? -amount : amount);
  if (!side && (Math.abs(line-half)>1e-9 || amount!==0)) throw new Error('Choose Side 1 or Side 2, or include Side 1: or Side 2: in the phrase.');
  if (fromGoal > half + 1e-8) throw new Error('Inside would cross midfield and contradict the side. Use the destination side with outside the 50.');
  const vOn = onVertical.exec(clauses[1]); const vOffset = offsetVertical.exec(clauses[1]);
  if (!vOn && !vOffset) throw new Error('Name front/back hash or sideline: on back hash, or 6 steps behind front hash.');
  const vertical = vOn?.[1] ?? vOffset![4];
  const ref = coordinateReferences(field).find(r=>r.name===vertical)!;
  const dy = vOffset ? distance(vOffset[1],vOffset[2],context) * (vOffset[3] === 'behind' ? -1 : 1) : 0;
  return { x: side === 2 ? field.width - fromGoal : fromGoal, y: ref.y + dy };
}

/** Forward/back use field Y; left/right use field X, independent of audience orientation or facing. */
export function parseDrillMove(input: string, context: DrillContext): Point {
  const clauses = clean(input,context).split(/\s*[,;]\s*|\s+and\s+/);
  if (!clauses.length || clauses.length > 2 || clauses.some(part=>!part)) throw new Error('Use one or two directions: 3 steps forward, 2 steps left.');
  const delta = { x: 0, y: 0 }; const axes = new Set<string>();
  for (const clause of clauses) {
    const match = relativeClause.exec(clause);
    if (!match) throw new Error('Use a nonnegative distance, steps/yards, and forward/back/left/right (or toward a named field side).');
    const direction = match[3].replace('toward the ','toward ');
    const axis = ['left','right','toward side 1','toward side 2'].includes(direction) ? 'x' : 'y';
    if (axes.has(axis)) throw new Error('Use only one direction per axis. Give one final forward/back or left/right distance.');
    axes.add(axis);
    const negative = ['left','back','backward','toward side 1','toward back sideline'].includes(direction);
    delta[axis] = distance(match[1],match[2],context) * (negative ? -1 : 1);
  }
  return delta;
}

/** Entry formatting uses the selected production step basis; legacy rehearsal output keeps its documented basis. */
export function formatDrillCoordinate(point: Point, field: Project['field'], stepsPerFive: DrillContext['stepsPerFive'], format: CoordinateFormat = {}): string {
  return coordinateDescription(point,field,format,stepsPerFive);
}

/** Exact moves reject the entire result at a boundary; they never snap or shorten a group delta. */
export function previewCoordinateEntry(positions: Record<string, Point>, ids: readonly string[], options: CoordinateEntryOptions, project: Pick<Project,'field'|'snapping'>): CoordinateEntryResult {
  try {
    const selected = [...new Set(ids)];
    if (!selected.length || selected.some(id=>!Object.hasOwn(positions,id))) throw new Error('Select performers on this set before entering coordinates.');
    if (!['absolute','relative'].includes(options.mode)) throw new Error('Choose absolute placement or a relative move.');
    if (options.mode === 'absolute' && selected.length !== 1) throw new Error('Absolute placement requires one performer. Use a relative move for a group.');
    const context: DrillContext = {side:options.side,defaultUnit:options.defaultUnit,stepsPerFive:(project.snapping??DEFAULT_SNAPPING).steps};
    const parsed: ParsedDrillEntry = options.mode === 'absolute' ? {mode:'absolute',point:parseDrillCoordinate(options.text,project.field,context)} : {mode:'relative',delta:parseDrillMove(options.text,context)};
    const updates: Record<string,Point> = {}; let changed=false; let outside=false;
    for (const id of selected) {
      const before=positions[id];
      if (![before.x,before.y].every(Number.isFinite)) throw new Error('Selected positions must be finite.');
      let point = parsed.mode === 'absolute' ? {...parsed.point} : {x:before.x+parsed.delta.x,y:before.y+parsed.delta.y};
      if (point.x < -1e-8 || point.y < -1e-8 || point.x > project.field.width + 1e-8 || point.y > project.field.height + 1e-8) outside=true;
      else point={x:Math.max(0,Math.min(project.field.width,point.x)),y:Math.max(0,Math.min(project.field.height,point.y))};
      changed ||= Math.abs(point.x-before.x)>1e-9 || Math.abs(point.y-before.y)>1e-9;
      updates[id]=point;
    }
    return { positions:{...positions,...updates},updates,parsed,changed,error:outside?'The preview crosses a field boundary. Change the phrase; the whole move is rejected without snapping, clamping or shortening.':null };
  } catch(error) {return {positions,updates:{},parsed:null,changed:false,error:(error as Error).message};}
}

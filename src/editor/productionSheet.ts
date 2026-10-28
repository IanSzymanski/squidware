import { PROJECT_LIMITS, setStartCount, setTiming, validateSetUpdate } from '../domain';
import { compileScore, defaultScore, validateScore } from '../score';
import { meterText, parseMeterText, projectMeter } from '../meter';
import type { Meter, Project, ScoreMap, SetPropertyUpdate } from '../types';
import { createPicture, updateSetProperties } from './projectEdits';

export const sheetColumns = ['name', 'counts', 'tempo', 'notes', 'meter', 'mark'] as const;
export const sheetLabels = ['Name', 'Counts', 'BPM', 'Notes', 'Meter', 'Mark'] as const;
interface RowUpdate { index: number; update: SetPropertyUpdate; meter?: Meter | null; mark?: string }
export interface SheetRange { row: number; column: number; cells: string[][] }
export interface SheetEdit extends SheetRange { revision: number; epoch: number }
export interface SheetCellReview { row: number; column: number; before: string; after: string; error?: string }

/** Quoted RFC-style fields, also used for spreadsheet TSV. No rows are silently skipped. */
export function parseSheetText(text: string, limits = { maxRows: PROJECT_LIMITS.sets as number, maxColumns: sheetColumns.length as number }): string[][] {
  if (!text || text.length > PROJECT_LIMITS.projectBytes) throw new Error('Paste nonempty data of at most 10 MB.');
  const source = text.replace(/^\uFEFF/, '');
  let quote = false, delimiter = ',';
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '"') { if (quote && source[i + 1] === '"') i++; else quote = !quote; }
    if (!quote && source[i] === '\t') { delimiter = '\t'; break; }
    if (!quote && /[\r\n]/.test(source[i])) break;
  }
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  const endCell = () => { row.push(cell); cell = ''; closed = false;
    if (row.length > limits.maxColumns) throw new Error(`Row ${rows.length + 1}: at most ${limits.maxColumns} columns.`); };
  const endRow = () => { endCell(); rows.push(row); row = [];
    if (rows.length > limits.maxRows) throw new Error(`At most ${limits.maxRows} rows can be pasted.`); };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') { if (source[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += char;
    } else if (char === delimiter) endCell();
    else if (char === '\r' || char === '\n') { if (char === '\r' && source[i + 1] === '\n') i++; endRow(); }
    else if (char === '"') { if (cell || closed) throw new Error(`Row ${rows.length + 1}: quote must begin a cell.`); quoted = true; }
    else if (closed) { if (char !== ' ') throw new Error(`Row ${rows.length + 1}: unexpected text after closing quote.`); }
    else cell += char;
  }
  if (quoted) throw new Error(`Row ${rows.length + 1}: unclosed quoted cell.`);
  if (cell || row.length || closed) endRow();
  if (!rows.length) throw new Error('Paste at least one row.');
  return rows;
}

export function sheetValue(project: Project, row: number, column: number): string {
  const set = project.sets[row], count = setStartCount(project,row);
  if (column === 4) return row === 0 ? meterText(projectMeter(project)) : project.score?.changes.find(c=>c.count===count) ? meterText(project.score.changes.find(c=>c.count===count)!.meter) : '';
  if (column === 5) return project.score?.marks.find(m=>m.count===count)?.label ?? '';
  return String(column === 0 ? set.name : column === 3 ? set.notes : setTiming(project, row)[column === 1 ? 'counts' : 'tempo']);
}

export function reviewSheetRange(project: Project, range: SheetRange, defaultCounts = 32) {
  const errors: string[] = [], cells: SheetCellReview[] = [], updates: RowUpdate[] = [];
  const { row, column } = range;
  if (!Number.isInteger(row) || row < 0 || row > project.sets.length || !Number.isInteger(column) || column < 0 || column >= sheetColumns.length)
    errors.push('Choose an existing cell or the row immediately after the sheet.');
  if (!Array.isArray(range.cells) || !range.cells.length || range.cells.length > PROJECT_LIMITS.sets) errors.push(`Choose 1–${PROJECT_LIMITS.sets} rows.`);
  if (errors.length) return { errors, cells, updates, added: 0, changed: 0 };
  if (row + range.cells.length > PROJECT_LIMITS.sets) errors.push(`The paste would exceed the ${PROJECT_LIMITS.sets}-set limit.`);
  const width = range.cells[0]?.length;
  range.cells.forEach((values, offset) => {
    const index = row + offset;
    if (!Array.isArray(values) || !values.length || values.length !== width || column + values.length > sheetColumns.length) {
      errors.push(`Row ${index + 1}: use a rectangular range that ends at or before Mark.`); return;
    }
    const update: SetPropertyUpdate = {}, music: Pick<RowUpdate, 'meter' | 'mark'> = {};
    values.forEach((text, at) => {
      const col = column + at, property = sheetColumns[col];
      let error: string | undefined;
      const numeric = property === 'counts' || property === 'tempo';
      const value = numeric ? (typeof text === 'string' && text.trim() ? Number(text) : NaN) : text;
      try {
        if (typeof text !== 'string') throw new Error('Use text cells.');
        // Reject JS-only numeric forms that are not spreadsheet decimal numbers.
        if (numeric && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim())) throw new Error('Enter a decimal number.');
        if (property === 'meter') {
          if (!text.trim() && index === 0) throw new Error('The opening meter is required.');
          music.meter = text.trim() ? parseMeterText(text) : null;
        } else if (property === 'mark') {
          if (text.length > PROJECT_LIMITS.text.groupName || /[\u0000-\u001f]/.test(text)) throw new Error('Use a mark of at most 80 characters without control characters.');
          music.mark = text.trim();
        } else validateSetUpdate({ [property]: value }, index);
      } catch (e) { error = index === 0 && property === 'counts' ? 'Opening counts must be 0.' : (e as Error).message.replace(/^Invalid project: sets\[\d+\]\.\w+ /, ''); }
      const before = index < project.sets.length ? sheetValue(project, index, col) : '';
      cells.push({ row: index, column: col, before, after: String(text), error });
      if (error) errors.push(`Row ${index + 1} · ${sheetLabels[col]}: ${error}`);
      else if (property !== 'meter' && property !== 'mark') Object.assign(update, { [property]: value });
    });
    updates.push({ index, update, ...music });
  });
  if (!errors.length) try { musicForRows(project,updates,Math.max(project.sets.length,row+range.cells.length),defaultCounts); } catch(e) { errors.push((e as Error).message); }
  return { errors, cells, updates, added: Math.max(0, row + range.cells.length - project.sets.length),
    changed: cells.filter(cell => !cell.error && cell.before !== cell.after).length };
}

/** Validate every cell before allocating new sets or touching the project. */
export function applySheetRange(project: Project, range: SheetRange, defaultCounts: number): Project {
  const review = reviewSheetRange(project, range, defaultCounts);
  if (review.errors.length) throw new Error(review.errors.join('\n'));
  let next = project;
  for (const { index, update } of review.updates) {
    if (index === next.sets.length) next = createPicture(next, index - 1, 'hold', defaultCounts);
    next = updateSetProperties(next, index, update);
  }
  return { ...next, ...musicForRows(project,review.updates,next.sets.length,defaultCounts) };
}

/** Musical anchors remain absolute show counts when drill timing changes. */
function musicForRows(project: Project, rows: RowUpdate[], length: number, defaultCounts: number): { meter?: Meter; score?: ScoreMap } {
  const counts = Array.from({length},(_,i)=>i===0?0:project.moves[i-1]?.counts ?? defaultCounts);
  for (const row of rows) if (row.update.counts !== undefined) counts[row.index]=row.update.counts;
  const starts:number[]=[];let total=0;for(const n of counts){total+=n;starts.push(total);}
  let meter=project.meter, score=project.score;
  if(rows.some(r=>r.meter!==undefined || r.mark!==undefined)) {
    score=structuredClone(score ?? defaultScore());
    for(const row of rows) {
      const count=starts[row.index];
      if(row.meter!==undefined) {
        if(row.index===0 && row.meter) meter=row.meter;
        else {score.changes=score.changes.filter(c=>c.count!==count);if(row.meter)score.changes.push({count,meter:row.meter});}
      }
      if(row.mark!==undefined) {score.marks=score.marks.filter(m=>m.count!==count);if(row.mark)score.marks.push({count,label:row.mark});}
    }
    score=validateScore(score);
  }
  compileScore({meter,score,moves:counts.slice(1).map(counts=>({counts}))});
  return { ...(meter===undefined?{}:{meter}),...(score===undefined?{}:{score}) };
}

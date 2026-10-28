import { PROJECT_LIMITS, setTiming, validateSetUpdate } from '../domain';
import type { Project, SetPropertyUpdate } from '../types';
import { createPicture, updateSetProperties } from './projectEdits';

export const sheetColumns = ['name', 'counts', 'tempo', 'notes'] as const;
export const sheetLabels = ['Name', 'Counts', 'BPM', 'Notes'] as const;
export interface SheetRange { row: number; column: number; cells: string[][] }
export interface SheetEdit extends SheetRange { revision: number; epoch: number }
export interface SheetCellReview { row: number; column: number; before: string; after: string; error?: string }

/** Quoted RFC-style fields, also used for spreadsheet TSV. No rows are silently skipped. */
export function parseSheetText(text: string): string[][] {
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
    if (row.length > sheetColumns.length) throw new Error(`Row ${rows.length + 1}: at most four columns (Name, Counts, BPM, Notes).`); };
  const endRow = () => { endCell(); rows.push(row); row = [];
    if (rows.length > PROJECT_LIMITS.sets) throw new Error(`At most ${PROJECT_LIMITS.sets} rows can be pasted.`); };
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
  const set = project.sets[row];
  return String(column === 0 ? set.name : column === 3 ? set.notes : setTiming(project, row)[column === 1 ? 'counts' : 'tempo']);
}

export function reviewSheetRange(project: Project, range: SheetRange) {
  const errors: string[] = [], cells: SheetCellReview[] = [], updates: { index: number; update: SetPropertyUpdate }[] = [];
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
      errors.push(`Row ${index + 1}: use a rectangular range that ends at or before Notes.`); return;
    }
    const update: SetPropertyUpdate = {};
    values.forEach((text, at) => {
      const col = column + at, property = sheetColumns[col];
      let error: string | undefined;
      const numeric = property === 'counts' || property === 'tempo';
      const value = numeric ? (typeof text === 'string' && text.trim() ? Number(text) : NaN) : text;
      try {
        if (typeof text !== 'string') throw new Error('Use text cells.');
        // Reject JS-only numeric forms that are not spreadsheet decimal numbers.
        if (numeric && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim())) throw new Error('Enter a decimal number.');
        validateSetUpdate({ [property]: value }, index);
      } catch (e) { error = index === 0 && property === 'counts' ? 'Opening counts must be 0.' : (e as Error).message.replace(/^Invalid project: sets\[\d+\]\.\w+ /, ''); }
      const before = index < project.sets.length ? sheetValue(project, index, col) : '';
      cells.push({ row: index, column: col, before, after: String(text), error });
      if (error) errors.push(`Row ${index + 1} · ${sheetLabels[col]}: ${error}`);
      else Object.assign(update, { [property]: value });
    });
    updates.push({ index, update });
  });
  return { errors, cells, updates, added: Math.max(0, row + range.cells.length - project.sets.length),
    changed: cells.filter(cell => !cell.error && cell.before !== cell.after).length };
}

/** Validate every cell before allocating new sets or touching the project. */
export function applySheetRange(project: Project, range: SheetRange, defaultCounts: number): Project {
  const review = reviewSheetRange(project, range);
  if (review.errors.length) throw new Error(review.errors.join('\n'));
  let next = project;
  for (const { index, update } of review.updates) {
    if (index === next.sets.length) next = createPicture(next, index - 1, 'hold', defaultCounts);
    next = updateSetProperties(next, index, update);
  }
  return next;
}

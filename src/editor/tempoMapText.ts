import { parseSheetText } from './productionSheet';
import { PROJECT_LIMITS } from '../projectValidation';
import { validateTempoMap } from '../tempo';
import type { TempoMap } from '../types';
export const emptyTempoMap = (): TempoMap => ({ version: 1, regions: [], holds: [] });
export function tempoMapText(map: TempoMap) {
  return { regions: map.regions.map(r => [r.startCount,r.endCount,r.startTempo,r.endTempo].join(',')).join('\n'),
    holds: map.holds.map(h => [h.count,h.seconds].join(',')).join('\n') };
}
export function parseTempoText(regions: string, holds: string, total: number): TempoMap {
  const rows = (text: string, columns: number) => (text.trim() ? parseSheetText(text, { maxRows: PROJECT_LIMITS.tempoEvents, maxColumns: columns }) : []).map((row,i) => {
    if (row.length !== columns || row.some(cell => !cell.trim() || !Number.isFinite(Number(cell)))) throw Error(`Timing row ${i+1}: use exactly ${columns} numeric CSV/TSV cells, without headings.`);
    return row.map(Number);
  });
  return validateTempoMap({ version: 1, regions: rows(regions,4).map(([startCount,endCount,startTempo,endTempo]) => ({startCount,endCount,startTempo,endTempo})), holds: rows(holds,2).map(([count,seconds]) => ({count,seconds})) },total);
}

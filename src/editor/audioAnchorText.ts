import { validateAudioAnchors } from '../audioAlignment';
import type { AudioAnchor } from '../types';
import { parseSheetText } from './productionSheet';

export function audioAnchorText(anchors: AudioAnchor[], offset: number) {
  return anchors.map(a => `${a.count},${Number((a.seconds + offset).toFixed(9))}`).join('\n');
}
export function parseAudioAnchorText(text: string, offset: number, total: number) {
  const rows = text.trim() ? parseSheetText(text, { maxRows: 256, maxColumns: 2 }) : [];
  return validateAudioAnchors(rows.map((row, i) => {
    if (row.length !== 2 || row.some(cell => !cell.trim())) throw Error(`Audio anchor row ${i + 1}: supply Count, Recording seconds.`);
    return { count: Number(row[0]), seconds: Number(row[1]) - offset };
  }), total);
}

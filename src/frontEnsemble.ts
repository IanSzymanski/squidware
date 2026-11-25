/** Planning dimensions in yards, independent of the rendered models. */
export const frontEnsembleCatalog = {
  marimba: { name: 'Marimba', width: 2.25, depth: 1.1, height: 1.05 },
  vibraphone: { name: 'Vibraphone', width: 2, depth: 1, height: 1.05 },
  xylophone: { name: 'Xylophone / glockenspiel', width: 1.5, depth: .85, height: 1.05 },
  timpani: { name: 'Timpani', width: 2.05, depth: 1.25, height: .95 },
  rack: { name: 'Percussion rack', width: 1.9, depth: 1, height: 1.45 },
  synth: { name: 'Keyboard / synth', width: 1.75, depth: .95, height: 1.1 },
};

export type FrontEnsembleModel = keyof typeof frontEnsembleCatalog;

export function isFrontEnsembleModel(value: unknown): value is FrontEnsembleModel {
  return typeof value === 'string' && Object.hasOwn(frontEnsembleCatalog, value);
}

import { TransitionAnalyzer } from './engine';
import type { AnalysisRequest, AnalysisResponse } from './input';

const scope = self as unknown as { onmessage: (event: MessageEvent<AnalysisRequest>) => void; postMessage: (message: AnalysisResponse) => void };
const analyzer = new TransitionAnalyzer();
let generation = 0;
scope.onmessage = async ({ data }) => {
  const current = ++generation;
  if (!data.input) return;
  try {
    const result = await analyzer.analyze(data.input, () => generation !== current);
    if (result && generation === current) scope.postMessage({ revision: data.revision, result });
  } catch (error) {
    if (generation === current) scope.postMessage({ revision: data.revision, error: error instanceof Error ? error.message : 'Transition check failed.' });
  }
};

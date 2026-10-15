

import type { ReactNode } from 'react';
import { Circle, Grid2X2, Minus, Waves } from 'lucide-react';
import type { FormationKind } from '../types';

export const formations: { kind: FormationKind; label: string; icon: ReactNode }[] = [
  { kind: 'line', label: 'Line', icon: <Minus /> }, { kind: 'arc', label: 'Arc', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M 4 17 Q 12 3 20 17" /></svg> },
  { kind: 'circle', label: 'Circle', icon: <Circle /> }, { kind: 'block', label: 'Block', icon: <Grid2X2 /> }, { kind: 'curve', label: 'Wave', icon: <Waves /> },
];

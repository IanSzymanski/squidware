

import type { ReactNode } from 'react';
import { Circle, Grid2X2, Minus, Waves } from 'lucide-react';
import type { FormationKind } from '../types';

export const formations: { kind: FormationKind; label: string; icon: ReactNode }[] = [
  { kind: 'line', label: 'Line', icon: <Minus /> }, { kind: 'arc', label: 'Arc', icon: <span className="arc-icon">⌒</span> },
  { kind: 'circle', label: 'Circle', icon: <Circle /> }, { kind: 'block', label: 'Block', icon: <Grid2X2 /> }, { kind: 'curve', label: 'Wave', icon: <Waves /> },
];

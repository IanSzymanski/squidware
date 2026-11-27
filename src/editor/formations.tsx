import type { ReactNode } from 'react';
import type { FormationKind } from '../types';
import { ArcIcon, BlockIcon, CircleIcon, LineIcon, WaveIcon } from '../ui/icons';

export const formations: { kind: FormationKind; label: string; icon: ReactNode }[] = [
  { kind: 'line', label: 'Line', icon: <LineIcon size={20} /> }, { kind: 'arc', label: 'Arc', icon: <ArcIcon size={20} /> },
  { kind: 'circle', label: 'Circle', icon: <CircleIcon size={20} /> }, { kind: 'block', label: 'Block', icon: <BlockIcon size={20} /> }, { kind: 'curve', label: 'Wave', icon: <WaveIcon size={20} /> },
];

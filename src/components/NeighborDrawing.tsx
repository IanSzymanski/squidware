import { useId } from 'react';
import type { NeighborOverlay } from '../neighborPaths';

/** Noninteractive review geometry sits behind every editable performer. */
export function NeighborDrawing({ overlays, scale = 1 }: { overlays: NeighborOverlay[]; scale?: number }) {
  const id = useId();
  const unit = 1 / scale;
  return <g data-neighbor-overlays="true" pointerEvents="none" aria-hidden="true">
    {overlays.map(overlay => {
      const incoming = overlay.direction === 'previous';
      const color = incoming ? '#b9e3f4' : '#f1d39a';
      const marker = `${id}-${overlay.direction}`;
      return <g key={overlay.direction} data-neighbor={overlay.direction} data-neighbor-set={overlay.setIndex} fill="none" stroke={color} strokeWidth={1.5 * unit}>
        <defs><marker id={marker} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M 1 1 L 7 4 L 1 7" stroke={color} strokeWidth="1.5" fill="none" /></marker></defs>
        {overlay.paths.map(path => {
          const ghost = incoming ? path.from : path.to;
          const moving = path.moving;
          return <g key={path.performerId} data-neighbor-performer={path.performerId}>
            {moving && <path data-neighbor-path="true" d={path.svg} strokeDasharray={incoming ? `${6 * unit} ${4 * unit}` : `${1 * unit} ${4 * unit}`} strokeLinecap="round" markerEnd={`url(#${marker})`} opacity="0.8" />}
            {incoming ? <circle data-neighbor-dot="true" cx={ghost.x} cy={ghost.y} r={4 * unit} /> : <path data-neighbor-dot="true" d={`M ${ghost.x} ${ghost.y - 5 * unit} l ${5 * unit} ${5 * unit} l ${-5 * unit} ${5 * unit} l ${-5 * unit} ${-5 * unit} Z`} />}
          </g>;
        })}
      </g>;
    })}
  </g>;
}

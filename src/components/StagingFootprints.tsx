import type { StagingSample } from '../staging';

/** Field coordinates; the parent applies the same audience orientation as it does to performer dots. */
export function StagingFootprints({ objects, selectedId }: { objects?: readonly StagingSample[]; selectedId?: string }) {
  if (!objects?.length) return null;
  return <g className="staging-footprints" pointerEvents="none">
    {objects.map(({ id, name, x, y, angle, width, depth, visible }) => {
      const selected = id === selectedId;
      if (!visible && !selected) return null;
      const ink = selected ? '#ffed9d' : '#fff2d2';
      return <g key={id} data-staging-id={id} transform={`translate(${x} ${y}) rotate(${-angle})`}>
        <title>{name}{visible ? '' : ' (hidden)'}</title>
        <rect x={-width / 2} y={-depth / 2} width={width} height={depth} fill="#37293e" fillOpacity={visible ? .82 : .18}
          vectorEffect="non-scaling-stroke" stroke={ink} strokeWidth={selected ? 2 : 1.25} strokeDasharray={visible ? undefined : '3 2'} />
        <path d={`M ${-width * .19} ${depth * .3} H ${width * .19}`} vectorEffect="non-scaling-stroke" stroke={ink} strokeWidth={1.25} />
      </g>;
    })}
  </g>;
}

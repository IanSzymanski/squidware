import type { StagingSample } from '../staging';

/** Field coordinates; the parent applies the same audience orientation as it does to performer dots. */
export function StagingFootprints({ objects, selectedId }: { objects?: readonly StagingSample[]; selectedId?: string }) {
  if (!objects?.length) return null;
  return <g className="staging-footprints" pointerEvents="none">
    {objects.map(({ id, name, model, footprint, x, y, angle, width, depth, visible }) => {
      const selected = id === selectedId;
      if (!visible && !selected) return null;
      const ink = selected ? '#ffed9d' : '#fff2d2';
      const diameter = Math.max(width, depth);
      const style = { fill: model ? '#243745' : '#37293e', fillOpacity: visible ? .82 : .18,
        vectorEffect: 'non-scaling-stroke', stroke: ink, strokeWidth: selected ? 2 : 1.25, strokeDasharray: visible ? undefined : '3 2' };
      const stripeWidth = footprint ? diameter : width, stripeDepth = footprint ? diameter : depth;
      return <g key={id} data-staging-id={id} data-staging-model={model} transform={`translate(${x} ${y}) rotate(${-angle})`}>
        <title>{name}{visible ? '' : ' (hidden)'}</title>
        {footprint ? <circle r={diameter / 2} {...style} /> : <rect x={-width / 2} y={-depth / 2} width={width} height={depth} {...style} />}
        <path d={`M ${-stripeWidth * .19} ${stripeDepth * .3} H ${stripeWidth * .19}`} vectorEffect="non-scaling-stroke" stroke={ink} strokeWidth={1.25} />
      </g>;
    })}
  </g>;
}

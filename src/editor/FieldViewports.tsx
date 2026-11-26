import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { FieldView } from '../workspaces';
import './fieldViewports.css';

const dividerSize = 12;
const stackBelow = 620;

export function FieldViewports({ view, field, preview, closePreview }: {
  view: FieldView; field: ReactNode; preview: ReactNode; closePreview: () => void;
}) {
  const split = view === 'split';
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: stackBelow, height: 320 });
  // The chart is what the writer edits, so it starts with most of the space and the 3D view is a monitor beside or below it; the divider changes that.
  const [preferred, setPreferred] = useState(72);
  const drag = useRef<{ pointer: number; start: number } | null>(null);

  useLayoutEffect(() => {
    const node = host.current;
    if (!split || !node) return;
    function measure() {
      const width = node!.clientWidth, height = node!.clientHeight;
      if (width && height) setSize(old => old.width === width && old.height === height ? old : { width, height });
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => { observer.disconnect(); drag.current = null; };
  }, [split]);

  // A field is wide, so the chart sits above and the 3D view runs under it as a panorama; only a very wide, short
  // area puts them side by side.
  const stacked = size.width < stackBelow || size.width < size.height * 2.6;
  const available = (stacked ? size.height : size.width) - dividerSize;
  const minimum = Math.min(50, Math.max(25, Math.ceil((stacked ? 144 : 240) * 100 / available)));
  const cap = (value: number) => Math.max(minimum, Math.min(100 - minimum, value));
  const value = cap(preferred);
  function resizeFromPointer(clientX: number, clientY: number) {
    const rect = host.current!.getBoundingClientRect();
    const length = stacked ? rect.height : rect.width;
    const offset = stacked ? clientY - rect.top : clientX - rect.left;
    const scale = length / (available + dividerSize);
    const point = offset / scale - dividerSize / 2;
    setPreferred(cap(Math.round(100 * point / available)));
  }

  return <div ref={host} className="field-viewports" data-layout={split ? stacked ? 'stacked' : 'side-by-side' : undefined}
    style={split ? { '--split-first': `${value}fr`, '--split-second': `${100 - value}fr` } as CSSProperties : undefined}>
    <div className="field-viewports__field" id="editable-field-viewport">{field}</div>
    {split && <div className="field-viewports__divider" role="separator" tabIndex={0} aria-label="Resize field and 3D preview"
      aria-description="Use arrow keys to resize. Press Enter to close the 3D preview."
      aria-controls="editable-field-viewport" aria-orientation={stacked ? 'horizontal' : 'vertical'}
      aria-valuemin={minimum} aria-valuemax={100 - minimum} aria-valuenow={value} aria-valuetext={`${value}% for the 2D field`}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointer: event.pointerId, start: preferred };
      }}
      onPointerMove={event => { if (drag.current?.pointer === event.pointerId) resizeFromPointer(event.clientX, event.clientY); }}
      onPointerUp={event => { if (drag.current?.pointer === event.pointerId) drag.current = null; }}
      onLostPointerCapture={event => {
        if (drag.current?.pointer === event.pointerId) { setPreferred(drag.current.start); drag.current = null; }
      }}
      onKeyDown={event => {
        const before = stacked ? 'ArrowUp' : 'ArrowLeft', after = stacked ? 'ArrowDown' : 'ArrowRight';
        if (!([before, after, 'Home', 'End', 'Enter'].includes(event.key) || event.key === 'Escape' && drag.current)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Enter') closePreview();
        else if (event.key === 'Escape' && drag.current) {
          const { start, pointer } = drag.current;
          drag.current = null;
          setPreferred(start);
          event.currentTarget.releasePointerCapture(pointer);
        } else setPreferred(cap(event.key === 'Home' ? minimum : event.key === 'End' ? 100 - minimum : value + (event.key === after ? 5 : -5)));
      }} />}
    {view !== '2d' && <div className="field-viewports__preview" role={split ? 'region' : undefined} aria-label={split ? 'Live 3D review' : undefined}>
      {preview}
    </div>}
  </div>;
}

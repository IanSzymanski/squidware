import { useEffect, type RefObject } from 'react';

/**
 * Marks a scroller with data-more="true" while content remains past its end, so a stylesheet can fade that edge.
 * Done with a scroll listener rather than a scroll-driven animation, which never reports itself finished.
 */
export function useScrollCue(ref: RefObject<HTMLElement | null>, axis: 'x' | 'y') {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const rest = axis === 'y' ? node.scrollHeight - node.clientHeight - node.scrollTop : node.scrollWidth - node.clientWidth - node.scrollLeft;
      const more = String(rest > 2);
      if (node.dataset.more !== more) node.dataset.more = more;
    };
    update();
    node.addEventListener('scroll', update, { passive: true });
    const sizes = new ResizeObserver(update);
    sizes.observe(node);
    const content = new MutationObserver(update);
    content.observe(node, { childList: true, subtree: true });
    return () => { node.removeEventListener('scroll', update); sizes.disconnect(); content.disconnect(); };
  }, [ref, axis]);
}

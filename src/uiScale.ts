/** Client rectangles/pointer coordinates include CSS zoom; layout offsets do not. */
export function uiScale(): number {
  return Number(document.documentElement.style.getPropertyValue('--ui-scale')) || 1;
}

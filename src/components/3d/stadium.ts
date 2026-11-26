/**
 * The stadium's ground plan around a field, in yards from the field's center. Everything solid stands outside the
 * playing surface: the sideline apron, then the track, then a curb, and only beyond that the stands.
 */
export function stadiumPlan(width: number, depth: number) {
  const halfWidth = width / 2, halfDepth = depth / 2;
  const sideline = 6, lanes = 6, lane = 1.2, track = lanes * lane, endZone = 10, curb = .45;
  const innerDepth = halfDepth + sideline;
  const innerLength = halfWidth + endZone - Math.sqrt(innerDepth ** 2 - halfDepth ** 2) + 1.6 + innerDepth;
  const outerDepth = innerDepth + track, outerLength = innerLength + track;
  const planLength = outerLength + curb, planDepth = outerDepth + curb;
  /** Distance from the field's long axis to the foot of a stand's front wall. */
  const standZ = planDepth + 2.2;
  return { halfWidth, halfDepth, sideline, lanes, lane, track, endZone, curb, innerDepth, innerLength, outerDepth, outerLength, planLength, planDepth, standZ };
}

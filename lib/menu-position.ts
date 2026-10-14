export function menuPlacement(
  top: number,
  bottom: number,
  height: number,
  viewTop: number,
  viewHeight: number,
) {
  const above = Math.max(0, top - viewTop - 8);
  const below = Math.max(0, viewTop + viewHeight - bottom - 8);
  const up = height > below && above > below;
  return { up, maxHeight: up ? above : below };
}

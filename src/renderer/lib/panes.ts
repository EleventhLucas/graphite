export function calculateSplitRatio(
  pointerX: number,
  containerLeft: number,
  containerWidth: number,
  handleWidth: number,
  grabOffset: number,
) {
  const availableWidth = containerWidth - handleWidth;
  if (availableWidth <= 0) return 0.5;
  const ratio = (pointerX - containerLeft - grabOffset) / availableWidth;
  return Math.max(0.2, Math.min(0.8, ratio));
}

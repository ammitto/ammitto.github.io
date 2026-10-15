/** Page-scrolled grid geometry. Heights include each row's following gap. */
export function gridOffsets(
  count: number,
  columns: number,
  heights: readonly (number | undefined)[],
  estimate = 190,
  gap = 16,
): number[] {
  const offsets = [0]
  for (let first = 0; first < count; first += columns) {
    let height = 0
    for (let i = first; i < Math.min(first + columns, count); i++) {
      height = Math.max(height, heights[i] ?? estimate)
    }
    offsets.push(offsets[offsets.length - 1] + height + gap)
  }
  return offsets
}

/** Row containing a pixel, clamped at either end (including an empty grid). */
export function rowAt(offsets: readonly number[], pixel: number): number {
  let low = 0
  let high = Math.max(0, offsets.length - 2)
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (offsets[middle] <= pixel) low = middle
    else high = middle - 1
  }
  return low
}

/** Visible + overscan rows, plus one focused row even when it is off screen. */
export function gridRows(
  offsets: readonly number[],
  top: number,
  viewport: number,
  overscan = 2,
  focusedRow = -1,
): number[] {
  const count = offsets.length - 1
  if (count <= 0) return []
  const start = Math.max(0, rowAt(offsets, top) - overscan)
  const end = Math.min(count - 1, rowAt(offsets, top + viewport) + overscan)
  const rows = Array.from({ length: end - start + 1 }, (_, i) => start + i)
  if (focusedRow >= 0 && focusedRow < count && !rows.includes(focusedRow)) {
    rows.push(focusedRow)
    rows.sort((a, b) => a - b)
  }
  return rows
}

/**
 * Hand control back to the event loop for one task, then resume.
 *
 * Posts a message to itself over a fresh MessageChannel instead of calling
 * `setTimeout(0)`, because browsers clamp nested zero-delay timers to about
 * 4ms and the search-index build yields hundreds of times. Measured on
 * 2026-09-23 through the real page load in headless Chromium, on a loaded
 * machine, in paired runs: the time between a yield and the resume averaged
 * ~5ms with `setTimeout(0)` against ~2.4ms with a message at 1x CPU, and the
 * build finished sooner with a message in 22 of 28 pairs across 1x and 4x
 * throttling, with the median longest block no worse.
 *
 * Each resume is a separate task, so the browser MAY run input handling and
 * rendering in between; the event loop does not promise that it will, since
 * it chooses between task queues itself and rendering is a separate step. In
 * the same runs, key presses sent during the build were handled while it
 * was still running, not queued until it finished.
 *
 * While the page is hidden it yields with `setTimeout(0)` instead, so a
 * background tab gets the browser's timer throttling: the build then runs
 * slowly instead of taking the CPU from the tab the reader is using, and the
 * next yield after the tab is shown again is back to full speed. Also used
 * where MessageChannel does not exist.
 *
 * Both ports are closed once the one message arrives, so nothing outlives the
 * yield.
 */
export function yieldToEventLoop(): Promise<void> {
  const hidden = typeof document !== 'undefined' && document.hidden
  if (hidden || typeof MessageChannel === 'undefined') {
    return new Promise((resolve) => setTimeout(resolve, 0))
  }
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel()
    port1.onmessage = () => {
      port1.close()
      port2.close()
      resolve()
    }
    port2.postMessage(null)
  })
}

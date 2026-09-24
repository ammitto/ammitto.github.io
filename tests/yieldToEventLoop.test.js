/**
 * The yield the search-index build uses between budgeted steps.
 *
 * It must resume, it must be a real task boundary rather than a microtask
 * (or typing never gets a turn), it must use a message rather than a clamped
 * timer when it can, it must leave no open port behind (hundreds of yields
 * per build), and it must fall back to a timer in a hidden tab or where
 * MessageChannel is missing.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { yieldToEventLoop } from '../.test-build/utils/yieldToEventLoop.js'

const openPorts = () =>
  process.getActiveResourcesInfo().filter((r) => r === 'MessagePort').length

/** Replace a global for one test, restoring it afterwards. */
function stubGlobal(t, name, value) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, name)
  const saved = globalThis[name]
  t.after(() => {
    if (had) globalThis[name] = saved
    else delete globalThis[name]
  })
  if (value === undefined) delete globalThis[name]
  else globalThis[name] = value
}

/** Count setTimeout calls made during the test, still scheduling them. */
function countTimers(t) {
  const real = globalThis.setTimeout
  const calls = { n: 0 }
  stubGlobal(t, 'setTimeout', (...args) => {
    calls.n++
    return real(...args)
  })
  return calls
}

/** Wraps the real MessageChannel, recording construction, posts and closes. */
function spyChannel(t) {
  const Real = globalThis.MessageChannel
  const seen = { created: 0, posted: 0, closed: 0 }
  class Spy {
    constructor() {
      seen.created++
      const ch = new Real()
      for (const port of [ch.port1, ch.port2]) {
        const post = port.postMessage.bind(port)
        const close = port.close.bind(port)
        port.postMessage = (m) => { seen.posted++; post(m) }
        port.close = () => { seen.closed++; close() }
      }
      this.port1 = ch.port1
      this.port2 = ch.port2
    }
  }
  stubGlobal(t, 'MessageChannel', Spy)
  return seen
}

async function assertYieldsAcrossATask() {
  let resumed = false
  const pending = yieldToEventLoop().then(() => { resumed = true })
  for (let i = 0; i < 50; i++) await Promise.resolve()
  assert.equal(resumed, false, 'a yield that resolves as a microtask never lets input in')
  await pending
  assert.equal(resumed, true)
}

test('resumes after a task boundary, not within the current microtask queue', async () => {
  await assertYieldsAcrossATask()
})

test('uses a MessageChannel message, not a timer, when one is available', async (t) => {
  const seen = spyChannel(t)
  const timers = countTimers(t)
  await yieldToEventLoop()
  assert.equal(seen.created, 1)
  assert.equal(seen.posted, 1)
  assert.equal(timers.n, 0, 'a zero-delay timer is clamped to ~4ms when nested')
})

test('closes both ports: no port outlives the yield', async (t) => {
  const before = openPorts()
  for (let i = 0; i < 200; i++) await yieldToEventLoop()
  assert.equal(openPorts(), before)

  const seen = spyChannel(t)
  await yieldToEventLoop()
  assert.equal(seen.closed, 2)
})

test('falls back to setTimeout where MessageChannel is missing', async (t) => {
  stubGlobal(t, 'MessageChannel', undefined)
  assert.equal(typeof MessageChannel, 'undefined')
  const timers = countTimers(t)
  await assertYieldsAcrossATask()
  assert.equal(timers.n, 1)
})

test('yields with a timer while the page is hidden, a message while visible', async (t) => {
  const doc = { hidden: true }
  stubGlobal(t, 'document', doc)
  const seen = spyChannel(t)
  const timers = countTimers(t)

  await assertYieldsAcrossATask()
  assert.deepEqual([seen.created, timers.n], [0, 1], 'hidden: throttleable timer')

  doc.hidden = false
  await yieldToEventLoop()
  assert.deepEqual([seen.created, timers.n], [1, 1], 'visible again: message')
})

test('a tab shown while a throttled yield is pending is back on messages at the next yield', async (t) => {
  // Visibility is read per call, so the build needs no listener: the pending
  // timer finishes on its own and the following yield sees the visible tab.
  const doc = { hidden: true }
  stubGlobal(t, 'document', doc)
  const seen = spyChannel(t)
  const timers = countTimers(t)

  const pending = yieldToEventLoop()
  doc.hidden = false
  await pending
  assert.deepEqual([seen.created, timers.n], [0, 1], 'the yield already started stays a timer')

  await yieldToEventLoop()
  assert.deepEqual([seen.created, timers.n], [1, 1], 'the next one is a message')
})

test('the search-index build yields through this helper', () => {
  const source = readFileSync(
    new URL('../src/composables/useSearchIndex.ts', import.meta.url),
    'utf8',
  )
  assert.match(
    source,
    /^\s*import\s+\{\s*yieldToEventLoop\s*\}\s+from\s+'@\/utils\/yieldToEventLoop'/m,
  )
  assert.match(source, /yieldControl:\s*yieldToEventLoop,/)
  assert.equal(/setTimeout\(resolve,\s*0\)/.test(source), false, 'no local timer-based yield left behind')
})

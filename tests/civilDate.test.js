import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { formatCivilDate } from '../.test-build/utils/civilDate.js'

test('a source civil date remains the same day in different viewer timezones', () => {
  const moduleUrl = new URL('../.test-build/utils/civilDate.js', import.meta.url).href
  for (const TZ of ['America/Los_Angeles', 'UTC', 'Pacific/Kiritimati']) {
    const actual = execFileSync(process.execPath, ['--input-type=module', '-e',
      `import { formatCivilDate } from ${JSON.stringify(moduleUrl)}; process.stdout.write(formatCivilDate('2024-12-05'))`],
    { env: { ...process.env, TZ }, encoding: 'utf8' })
    assert.equal(actual, 'December 5, 2024', TZ)
  }
})

test('validates calendar dates instead of normalizing impossible dates', () => {
  assert.equal(formatCivilDate('2024-02-29', 'short'), 'Feb 29, 2024')
  for (const raw of ['2023-02-29', '2024-02-30', '2024-13-01', '2024-00-01', '2024-12-00', 'not a date']) {
    assert.equal(formatCivilDate(raw), raw)
  }
})

test('preserves partial precision, explicit timestamps and unknown source values', () => {
  for (const raw of ['1962', '1981–1983', '2024-12', '2024-12-05T23:30:00-08:00', 'unknown']) {
    assert.equal(formatCivilDate(raw), raw)
  }
  assert.equal(formatCivilDate(), '')
  assert.equal(formatCivilDate(''), '')
  assert.equal(formatCivilDate('0099-12-05'), 'December 5, 99')
})

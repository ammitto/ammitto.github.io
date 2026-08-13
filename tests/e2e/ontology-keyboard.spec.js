import { test, expect } from '@playwright/test'
import { collectPageErrors, gotoRendered, useTheme } from './helpers.js'

/**
 * The class hierarchy must be operable from a keyboard — WCAG 2.1.1, and the
 * only reason the browser suite can say anything about it at all.
 *
 * The defect this guards is not hypothetical: both selection handlers hung off
 * `@click` on plain `<div>`s. A div is not in the tab order and does not fire
 * a click on Enter, so a keyboard user could reach the expand/collapse button
 * (which was already a real button) and open the tree, and then had no way to
 * open any class in it. "The expander is accessible" was true and beside the
 * point — the page's main action was not.
 *
 * Everything below is driven with the keyboard only. No `locator.click()`, no
 * `focus()`, no `dispatchEvent`: each control is reached by pressing Tab until
 * the browser's own focus lands on it, which is the thing being proven. A
 * control that is not in the tab order can never satisfy `tabTo`, and the test
 * fails on the step count rather than on the assertion after it.
 */

/**
 * Press Tab until the active element matches `selector`, and return it.
 *
 * The bound is a real assertion, not a safety valve: an unfocusable target
 * exhausts it, and that is exactly the failure this file exists to produce.
 */
async function tabTo(page, selector, { limit = 200 } = {}) {
  for (let pressed = 0; pressed < limit; pressed += 1) {
    await page.keyboard.press('Tab')
    const matched = await page.evaluate(
      (sel) => Boolean(document.activeElement && document.activeElement.matches(sel)),
      selector,
    )
    if (matched) return page.locator(':focus')
  }
  throw new Error(
    `${limit} Tab presses never put focus on "${selector}" — it is not in the tab order, ` +
      `so a keyboard user cannot operate it`,
  )
}

test('the class hierarchy can be expanded and a class selected with the keyboard alone', async ({
  page,
}) => {
  const errors = collectPageErrors(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await useTheme(page, 'light')
  await gotoRendered(page, '/ontology')

  // The tree must have rendered, or the tab sweep below would run out of
  // presses against a page that simply has no tree on it and the failure would
  // name the wrong cause.
  await expect(page.locator('.hierarchy-select').first()).toBeVisible({ timeout: 15000 })
  const expander = page.locator('.hierarchy-row button[aria-expanded]').first()
  await expect(expander).toBeVisible()

  // 1. Selection. Tab to the first row's selection control and activate it
  //    with Enter. The details panel renders the selected class's label, so
  //    the assertion is on what a reader would see, not on internal state.
  const firstSelect = await tabTo(page, '.hierarchy-select')
  // `.hierarchy-label`, not the button's own text: the row also carries an
  // icon and a count, and innerText breaks a flex row at every child, so the
  // button's first line is the icon rather than the class name.
  const label = (await firstSelect.locator('.hierarchy-label').innerText()).trim()
  expect(label.length, 'the first hierarchy row rendered no label to select by').toBeGreaterThan(0)
  await page.keyboard.press('Enter')

  await expect(
    page.locator('h3').filter({ hasText: label }).first(),
    `pressing Enter on the "${label}" row did not open its details`,
  ).toBeVisible({ timeout: 10000 })
  await expect(
    page.locator('.hierarchy-select[aria-current="true"]'),
    'the selected row does not report itself as current to assistive technology',
  ).toHaveCount(1)

  // 2. Expansion still works, and from the keyboard too. Reload so the tab
  //    sweep starts from a known focus position rather than from wherever
  //    selection left it.
  await gotoRendered(page, '/ontology')
  await expect(page.locator('.hierarchy-select').first()).toBeVisible({ timeout: 15000 })

  const before = await expander.getAttribute('aria-expanded')
  const rowsBefore = await page.locator('.hierarchy-select').count()
  await tabTo(page, '.hierarchy-row button[aria-expanded]')
  await page.keyboard.press('Enter')

  await expect(
    page.locator('.hierarchy-row button[aria-expanded]').first(),
    'Enter on the expander did not change aria-expanded',
  ).toHaveAttribute('aria-expanded', before === 'true' ? 'false' : 'true')
  const rowsAfter = await page.locator('.hierarchy-select').count()
  expect(
    rowsAfter,
    `aria-expanded flipped but the tree did not: ${rowsBefore} selectable rows before, ` +
      `${rowsAfter} after`,
  ).not.toBe(rowsBefore)

  expect(errors, `/ontology threw: ${errors.join('\n')}`).toEqual([])
})

/**
 * Selecting a subclass must select the subclass.
 *
 * It did not. The selectable region was the outer `.hierarchy-node` div, which
 * also contained the expanded subtree, so a click on a subclass ran its own
 * handler and then bubbled into its parent's, which overwrote the selection
 * with the parent. The visible result was a details panel showing the wrong
 * class. Selection now lives on a button that wraps only its own row's label,
 * which removes the nesting rather than suppressing the event.
 */
test('selecting a subclass does not fall through to its parent', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await useTheme(page, 'light')
  await gotoRendered(page, '/ontology')
  await expect(page.locator('.hierarchy-select').first()).toBeVisible({ timeout: 15000 })

  // An indented row is a subclass: it is the one whose ancestor chain contains
  // a second .hierarchy-node.
  const nested = page.locator('.hierarchy-node .hierarchy-node .hierarchy-select').first()
  await expect(
    nested,
    'no expanded subclass row on /ontology — nothing to prove the fall-through against',
  ).toBeVisible({ timeout: 10000 })

  const nestedLabel = (await nested.locator('.hierarchy-label').innerText()).trim()
  await nested.click()

  await expect(
    page.locator('.hierarchy-select[aria-current="true"]'),
    'more or fewer than one row reports itself current after selecting a subclass',
  ).toHaveCount(1)
  expect(
    (
      await page
        .locator('.hierarchy-select[aria-current="true"] .hierarchy-label')
        .innerText()
    ).trim(),
    'selecting a subclass marked a different row as current',
  ).toBe(nestedLabel)
  await expect(
    page.locator('h3').filter({ hasText: nestedLabel }).first(),
    `selecting "${nestedLabel}" opened some other class's details`,
  ).toBeVisible({ timeout: 10000 })
})

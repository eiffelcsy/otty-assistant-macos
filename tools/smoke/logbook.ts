// The Logbook (D-63) as the smoke specs reach it: the header button, the view menu, entries and their details.
import type { Locator, Page } from '@playwright/test'
import { expect, goTo } from './fixtures'

/** Opens the Logbook from the rail or the compact screen menu, on a view if one is named ("Needs you", "Coming up", "What left my Mac"…). */
export async function openLogbook(panel: Page, view?: string): Promise<void> {
  if (!(await panel.locator('.logbook').isVisible())) {
    const rail = panel.locator('.frame__nav').getByRole('button', { name: /^Logbook/ })
    if (await rail.isVisible()) await rail.click()
    else await goTo(panel, 'Logbook')
    await expect(panel.locator('.logbook')).toBeVisible()
  }
  if (view) await showView(panel, view)
}

export async function showView(panel: Page, view: string): Promise<void> {
  if ((await panel.locator('.log-details').count()) > 0) await panel.locator('.log-details__back').click()
  await panel.locator('.log-head__menu').click()
  await panel.getByRole('menuitemradio', { name: new RegExp(`^${view}`) }).click()
  await expect(panel.locator('.log-head__menu')).toHaveText(view)
}

/** Entries whose words include `text`. */
export const entry = (panel: Page, text: string): Locator => panel.locator('li.log-entry').filter({ hasText: text })

/** A look-up's own entry, by its title in quotes, so what it sent doesn't match too. */
export const lookEntry = (panel: Page, title: string): Locator => entry(panel, `“${title}”`).filter({ hasNot: panel.locator('.log-entry__glyph.fi-rr-check-circle') })

/** Opens an entry's details and returns them. */
export async function openEntry(target: Locator): Promise<Locator> {
  await target.first().locator('.log-entry__open').click()
  const details = target.page().locator('.log-details')
  await expect(details).toBeVisible()
  return details
}

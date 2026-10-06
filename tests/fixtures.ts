import { test as base, expect, type BrowserContext } from '@playwright/test';

/**
 * Shared fixtures. Import `test` and `expect` from this file in every test:
 *
 *   import { test, expect } from './fixtures';
 *
 * GREMLIN_RELEASE (in .env or in your shell):
 *   empty   follow the release the facilitator ships (the default)
 *   1, 2, 3 pin that release for every browser context with the `gb_release` cookie
 *
 * Release 2 shows a cookie consent dialog; the `page` fixture accepts it whenever it appears
 * (a locator handler, so it runs only when the dialog is there).
 */

export type Release = 1 | 2 | 3;

const rawRelease = (process.env.GREMLIN_RELEASE ?? '').trim();
if (rawRelease && !['1', '2', '3'].includes(rawRelease)) {
  throw new Error(`GREMLIN_RELEASE must be empty, 1, 2 or 3. Found "${rawRelease}". Check .env and your shell.`);
}

/** The release pinned with GREMLIN_RELEASE, or undefined when following the facilitator's release. */
export const pinnedRelease: Release | undefined = rawRelease ? (Number(rawRelease) as Release) : undefined;

/** Reads a required value from the environment (.env). Throws a readable error when it is missing. */
export function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

/**
 * Pins the release on a context you created yourself with browser.newContext().
 * The `context` and `page` fixtures below already do this.
 */
export async function pinRelease(context: BrowserContext, baseURL: string): Promise<void> {
  if (pinnedRelease) {
    await context.addCookies([{ name: 'gb_release', value: String(pinnedRelease), url: baseURL }]);
  }
}

type WorkerFixtures = {
  /** The Gremlin Bank release under test: GREMLIN_RELEASE, or what /health reports right now. */
  gremlinRelease: Release;
};

export const test = base.extend<{}, WorkerFixtures>({
  context: async ({ context, baseURL }, use) => {
    await pinRelease(context, baseURL!);
    await use(context);
  },

  page: async ({ page }, use) => {
    const consent = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Cookies' }) });
    await page.addLocatorHandler(consent, async () => {
      await consent.getByRole('button', { name: 'Accept all' }).click();
    });
    await use(page);
  },

  gremlinRelease: [
    async ({ browser }, use, workerInfo) => {
      if (pinnedRelease) {
        await use(pinnedRelease);
        return;
      }
      // Ask the app through the browser, so the same network path (proxy) is used as in the tests.
      const context = await browser.newContext({ baseURL: workerInfo.project.use.baseURL });
      const page = await context.newPage();
      const response = await page.goto('/health');
      const body = (await response?.json()) as { release?: number } | undefined;
      await context.close();
      if (body?.release !== 1 && body?.release !== 2 && body?.release !== 3) {
        throw new Error(`Could not read the release from ${workerInfo.project.use.baseURL}/health`);
      }
      await use(body.release);
    },
    { scope: 'worker' },
  ],
});

export { expect };

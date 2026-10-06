import { test } from './tests/fixtures';
import { LoginPage } from './tests/pages/login-page';

// Seed for the Playwright Test Agents. The planner and the generator run this test first
// and continue from the page it leaves open: the Gremlin Bank dashboard, signed in.
// The user and password come from .env (GREMLIN_USER, GREMLIN_PASSWORD). The `page` fixture
// accepts the cookie dialog.

test.describe('Gremlin Bank', () => {
  test('seed', async ({ page }) => {
    await new LoginPage(page).signInToDashboard();
  });
});

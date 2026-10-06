// spec: specs/gremlin-bank.md
// seed: seed.spec.ts

import { test, expect, env } from './fixtures';
import { DashboardPage } from './pages/dashboard-page';
import { LoginPage } from './pages/login-page';

test.describe('Sign in and sign out', () => {
  test('signs in with valid credentials and signs out', async ({ page }) => {
    const login = new LoginPage(page);
    const dashboard = new DashboardPage(page);

    // 1. Open /login
    await login.goto();
    await expect(login.heading).toBeVisible();

    // 2. Sign in with GREMLIN_USER / GREMLIN_PASSWORD
    await login.signIn();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(dashboard.heading).toBeVisible();
    await expect(dashboard.signedInAs(env('GREMLIN_USER'))).toBeVisible();

    // 3. Click 'Sign out'
    await dashboard.signOut();
    await expect(page).toHaveURL(/\/login$/);
    await expect(login.signInButton).toBeVisible();
    await expect(dashboard.anySignedInText).toHaveCount(0);
  });

  test('rejects a wrong password with a generic message', async ({ page }) => {
    const login = new LoginPage(page);

    // 1. Sign in with a password that differs from GREMLIN_PASSWORD
    await login.signIn(`${env('GREMLIN_PASSWORD')}x`);

    await expect(login.alert).toHaveText('Wrong username or password.');
    await expect(page).toHaveURL(/\/login$/);
    await expect(new DashboardPage(page).anySignedInText).toHaveCount(0);
  });

  test('redirects to the sign-in page after sign out', async ({ page }) => {
    const login = new LoginPage(page);

    // 1. Sign in and sign out
    const dashboard = await login.signInToDashboard();
    await dashboard.signOut();
    await expect(page).toHaveURL(/\/login$/);

    // 2. Open /dashboard directly
    await dashboard.goto();
    await expect(page).toHaveURL(/\/login$/);
    await expect(login.heading).toBeVisible();
    await expect(dashboard.recentTransactionsHeading).toHaveCount(0);
  });
});

// spec: specs/gremlin-bank.md
// seed: seed.spec.ts

import { test, expect } from './fixtures';
import type { DashboardPage } from './pages/dashboard-page';
import { LoginPage } from './pages/login-page';

// Local calendar date as YYYY-MM-DD, `daysAgo` days before today.
function isoDate(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test.describe('Dashboard', () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = await new LoginPage(page).signInToDashboard();
  });

  test('shows both accounts with their IBAN and opening balance', async () => {
    // 1. Read the two account cards
    const everyday = dashboard.accountCard('Everyday Account');
    await expect(everyday.getByText('HU39 9992 0265 3141 5926 5358 9797')).toBeVisible();
    await expect(everyday.getByText('1,250,000 HUF')).toBeVisible();

    const savings = dashboard.accountCard('Savings Account');
    await expect(savings.getByText('HU03 9992 0265 2718 2818 2845 9043')).toBeVisible();
    await expect(savings.getByText('5,400,000 HUF')).toBeVisible();
  });

  test('lists the five seed transactions newest first', async () => {
    // 1. Read the 'Recent transactions' table
    const rows = dashboard.transactionRows;
    await expect(rows).toHaveCount(5);

    const expected = [
      ['Grocery store, Budapest', '-18,450 HUF'],
      ['Salary, Gremlin Works Ltd.', '+685,000 HUF'],
      ['Mobile phone bill', '-7,990 HUF'],
      ['Card payment, bookshop', '-12,300 HUF'],
      ['Transfer from Savings Account', '+50,000 HUF'],
    ];
    for (const [i, [description, amount]] of expected.entries()) {
      await expect(dashboard.transactionDescription(rows.nth(i))).toHaveText(description);
      await expect(dashboard.transactionAmount(rows.nth(i))).toHaveText(amount);
    }

    // Dates: YYYY-MM-DD, not later than today, descending (exact dates not asserted)
    const dates = await dashboard.transactionDates.allTextContents();
    expect(dates).toHaveLength(5);
    const today = isoDate();
    for (const date of dates) {
      expect(date <= today, `transaction date ${date} is later than today (${today})`).toBe(true);
    }
    expect(dates, 'transaction dates are not in descending order').toEqual([...dates].sort().reverse());
  });

  test('shows 30 days of chart data ending today', async () => {
    // 1. Click 'Show chart data'
    await dashboard.showChartData();
    await expect(dashboard.hideChartDataButton).toBeVisible();
    await expect(dashboard.chartRows).toHaveCount(30);

    await expect(dashboard.chartDates).toHaveCount(30);
    await expect(dashboard.chartDates.first()).toHaveText(isoDate(29));
    await expect(dashboard.chartDates.last()).toHaveText(isoDate(0));

    await expect(dashboard.chartAmounts).toHaveCount(30);
    for (const amount of await dashboard.chartAmounts.allTextContents()) {
      expect(amount, `chart amount "${amount}" is not a whole HUF value`).toMatch(/^\d{1,3}(,\d{3})* HUF$/);
    }

    // 2. Click 'Hide chart data'
    await dashboard.hideChartData();
    await expect(dashboard.chartTable).toBeHidden();
    await expect(dashboard.showChartDataButton).toBeVisible();
  });
});

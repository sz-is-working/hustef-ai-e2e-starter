import type { Locator, Page } from '@playwright/test';
import { expect } from '../fixtures';

export type AccountName = 'Everyday Account' | 'Savings Account';

// Dashboard (/dashboard): account cards, recent transactions and the spending chart data.
export class DashboardPage {
  readonly heading: Locator;
  readonly signOutButton: Locator;
  readonly recentTransactionsHeading: Locator;
  readonly transactionRows: Locator;
  readonly showChartDataButton: Locator;
  readonly hideChartDataButton: Locator;
  // The caption ends with a workshop marker code, so only its start is matched.
  readonly chartTable: Locator;
  readonly chartRows: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { level: 1, name: 'Accounts' });
    this.signOutButton = page.getByRole('button', { name: 'Sign out' });
    this.recentTransactionsHeading = page.getByRole('heading', { name: 'Recent transactions' });
    this.transactionRows = page
      .getByRole('table', { name: 'Recent transactions' })
      .getByRole('row')
      .filter({ has: page.getByRole('cell') });
    this.showChartDataButton = page.getByRole('button', { name: 'Show chart data' });
    this.hideChartDataButton = page.getByRole('button', { name: 'Hide chart data' });
    this.chartTable = page.getByRole('table', { name: /^Spending in the last 30 days/ });
    this.chartRows = this.chartTable.getByRole('row').filter({ has: page.getByRole('cell') });
  }

  async goto() {
    await this.page.goto('/dashboard');
  }

  async waitUntilShown() {
    await expect(this.heading).toBeVisible();
  }

  signedInAs(user: string): Locator {
    return this.page.getByText(`Signed in as ${user}`);
  }

  // Any 'Signed in as' text, to check that nobody is signed in.
  get anySignedInText(): Locator {
    return this.page.getByText('Signed in as');
  }

  // The accounts are rows of a table whose row header is the account name.
  accountCard(name: AccountName): Locator {
    return this.page.getByRole('row').filter({ has: this.page.getByRole('rowheader', { name, exact: true }) });
  }

  // Cells of a Recent transactions row: Date, Description, Amount.
  transactionDescription(row: Locator): Locator {
    return row.getByRole('cell').nth(1);
  }

  transactionAmount(row: Locator): Locator {
    return row.getByRole('cell').nth(2);
  }

  get transactionDates(): Locator {
    return this.transactionRows.getByRole('cell').filter({ hasText: /^\d{4}-\d{2}-\d{2}$/ });
  }

  get chartDates(): Locator {
    return this.chartRows.getByRole('cell').filter({ hasText: /^\d{4}-\d{2}-\d{2}$/ });
  }

  get chartAmounts(): Locator {
    return this.chartRows.getByRole('cell').filter({ hasText: / HUF$/ });
  }

  async showChartData() {
    await this.showChartDataButton.click();
  }

  async hideChartData() {
    await this.hideChartDataButton.click();
  }

  async signOut() {
    await this.signOutButton.click();
  }
}

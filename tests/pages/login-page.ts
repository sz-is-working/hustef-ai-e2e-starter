import type { Locator, Page } from '@playwright/test';
import { env } from '../fixtures';
import { DashboardPage } from './dashboard-page';

// Sign-in form on /login. The user and password come from .env.
export class LoginPage {
  readonly heading: Locator;
  readonly username: Locator;
  readonly password: Locator;
  readonly signInButton: Locator;
  readonly alert: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { level: 1, name: 'Welcome back' });
    this.username = page.getByRole('textbox', { name: 'User ID' });
    this.password = page.getByRole('textbox', { name: 'Password' });
    this.signInButton = page.getByRole('button', { name: 'Log in' });
    this.alert = page.getByRole('alert');
  }

  async goto() {
    await this.page.goto('/login');
  }

  // Signs in as GREMLIN_USER; pass another password to try a wrong one.
  async signIn(password = env('GREMLIN_PASSWORD')) {
    await this.goto();
    await this.username.fill(env('GREMLIN_USER'));
    await this.password.fill(password);
    await this.signInButton.click();
  }

  // Signs in as GREMLIN_USER and returns the dashboard once it is shown.
  async signInToDashboard(): Promise<DashboardPage> {
    await this.signIn();
    const dashboard = new DashboardPage(this.page);
    await dashboard.waitUntilShown();
    return dashboard;
  }
}

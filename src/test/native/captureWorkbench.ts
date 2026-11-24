import { chromium, type Page } from '@playwright/test';

export async function captureWorkbench(assertVisible: (workbench: Page) => Promise<void>): Promise<void> {
    const path = process.env.SPE_UX_SCREENSHOT_PATH;
    if (!path) throw new Error('Desktop screenshot output is unavailable.');
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 10_000 });
    try {
        const workbench = browser.contexts().flatMap(context => context.pages()).find(page =>
            /^vscode-file:\/\/vscode-app\/.*\/workbench\.html(?:[?#]|$)/.test(page.url()));
        if (!workbench) throw new Error('Could not find the desktop VS Code workbench.');
        await assertVisible(workbench);
        await workbench.screenshot({ path, timeout: 10_000 });
    } finally {
        await browser.close();
    }
}

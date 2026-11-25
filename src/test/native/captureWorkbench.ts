import { chromium, type Locator, type Page } from '@playwright/test';
import { captureUxEvidence } from '../captureUxEvidence';

export async function captureWorkbench(selectTarget: (workbench: Page) => Promise<Locator>): Promise<void> {
    const path = process.env.SPE_UX_SCREENSHOT_PATH;
    if (!path) throw new Error('Desktop screenshot output is unavailable.');
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 10_000 });
    try {
        const workbench = browser.contexts().flatMap(context => context.pages()).find(page =>
            /^vscode-file:\/\/vscode-app\/.*\/workbench\.html(?:[?#]|$)/.test(page.url()));
        if (!workbench) throw new Error('Could not find the desktop VS Code workbench.');
        await captureUxEvidence(await selectTarget(workbench), path);
    } finally {
        await browser.close();
    }
}

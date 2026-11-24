import { expect } from '@playwright/test';
import * as vscode from 'vscode';
import { captureWorkbench } from './captureWorkbench';

export async function run(): Promise<void> {
    const text = 'SPE desktop screenshot smoke';
    const doc = await vscode.workspace.openTextDocument({ content: text, language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await captureWorkbench(async workbench => {
        await expect(workbench.locator('.monaco-editor .view-lines').getByText(text, { exact: true })).toBeVisible();
    });
}

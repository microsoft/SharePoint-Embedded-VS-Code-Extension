import * as vscode from 'vscode';
import { captureWorkbench } from './captureWorkbench';

export async function run(): Promise<void> {
    const text = 'SPE desktop screenshot smoke';
    await captureWorkbench(async workbench => {
        void vscode.window.showInformationMessage(text);
        return workbench.locator('.notifications-toasts .notification-list-item')
            .filter({ has: workbench.getByText(text, { exact: true }) });
    });
}

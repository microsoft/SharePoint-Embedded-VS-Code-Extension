/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export type BillingChoice = 'trial' | 'standard' | 'directToCustomer';

interface BillingQuickPickItem extends vscode.QuickPickItem {
    choice: BillingChoice;
}

/**
 * Prompts the user to pick a billing type for a new container type.
 *
 * Mirrors the SharePoint admin center "Create app" flow, where the billing
 * classification is chosen up front and drives the rest of the wizard.
 */
export async function pickBillingType(): Promise<BillingChoice | undefined> {
    const items: BillingQuickPickItem[] = [
        {
            choice: 'trial',
            label: vscode.l10n.t('Trial'),
            description: vscode.l10n.t('Free, expires after 30 days'),
            detail: vscode.l10n.t('Best for evaluation and early development. No billing setup required.')
        },
        {
            choice: 'standard',
            label: vscode.l10n.t('Standard (Owner org)'),
            description: vscode.l10n.t('Billed to the org that owns the app'),
            detail: vscode.l10n.t('Connect an Azure subscription now or set it up later. Use for line-of-business apps where the owner org pays.')
        },
        {
            choice: 'directToCustomer',
            label: vscode.l10n.t('Direct to customer (User org)'),
            description: vscode.l10n.t('Billed to the org using the app'),
            detail: vscode.l10n.t('An admin in the user org must set up pay-as-you-go billing in the Microsoft 365 admin center.')
        }
    ];

    const picked = await vscode.window.showQuickPick<BillingQuickPickItem>(items, {
        title: vscode.l10n.t('Create container type'),
        placeHolder: vscode.l10n.t('Select a billing type for this container type'),
        ignoreFocusOut: true,
        matchOnDescription: true,
        matchOnDetail: true
    });

    return picked?.choice;
}

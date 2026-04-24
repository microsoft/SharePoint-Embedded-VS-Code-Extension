/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ARMProvider } from '../../../services/ARM/ARMProvider';
import { ArmSubscriptionSummary } from '../../../services/ARM/SubscriptionService';

interface SubscriptionQuickPickItem extends vscode.QuickPickItem {
    subscription: ArmSubscriptionSummary;
}

/**
 * Prompts the user to pick an Azure subscription to bill a Standard
 * container type against. Returns `undefined` if the user escapes or has no
 * visible subscriptions.
 */
export async function pickSubscription(): Promise<ArmSubscriptionSummary | undefined> {
    const arm = ARMProvider.getInstance();

    let subscriptions: ArmSubscriptionSummary[];
    try {
        subscriptions = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Loading Azure subscriptions...') },
            () => arm.subscriptions.list()
        );
    } catch (error: any) {
        vscode.window.showErrorMessage(
            vscode.l10n.t('Failed to load Azure subscriptions: {0}', error?.message ?? String(error))
        );
        return undefined;
    }

    const enabled = subscriptions.filter(s => (s.state ?? '').toLowerCase() === 'enabled');
    const pool = enabled.length > 0 ? enabled : subscriptions;

    if (pool.length === 0) {
        vscode.window.showErrorMessage(
            vscode.l10n.t('No Azure subscriptions were returned for your account. You need at least one active subscription to bill a Standard container type.')
        );
        return undefined;
    }

    const items: SubscriptionQuickPickItem[] = pool.map(s => ({
        subscription: s,
        label: s.displayName,
        description: s.subscriptionId,
        detail: s.state ? vscode.l10n.t('State: {0}', s.state) : undefined
    }));

    const picked = await vscode.window.showQuickPick<SubscriptionQuickPickItem>(items, {
        title: vscode.l10n.t('Pick an Azure subscription'),
        placeHolder: vscode.l10n.t('Billing for the container type will be set up in this subscription'),
        matchOnDescription: true,
        matchOnDetail: true,
        ignoreFocusOut: true
    });

    return picked?.subscription;
}

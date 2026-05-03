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

const AZURE_PORTAL_SUBSCRIPTIONS_URL = 'https://portal.azure.com/#blade/Microsoft_Azure_Billing/SubscriptionsBlade';

// TODO(SPAC): consult Neha / Yogesh / Yashi for the correct client-side filter
// to apply to the subscription list (e.g. exclude trial/EA subs that can't
// host Microsoft.Syntex/accounts). Until then we surface every subscription
// the user can see and let the RBAC pre-check in attachBillingToContainerType
// catch insufficient access.

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
        const openPortal = vscode.l10n.t('Open Azure portal');
        const choice = await vscode.window.showErrorMessage(
            // Empty list usually means one of: (1) the directory has no
            // subscriptions associated yet, or (2) the signed-in user has no
            // role on any sub. Both resolve the same way — talk to your
            // Azure admin or create a sub in the portal — so we keep one
            // consolidated message rather than guessing.
            vscode.l10n.t('No Azure subscriptions are visible to your account. To bill a Standard container type, you need access to at least one subscription. Ask your Azure admin to grant a role on a subscription, or create one in the Azure portal, then retry "Attach billing" from the container type\'s context menu.'),
            openPortal
        );
        if (choice === openPortal) {
            vscode.env.openExternal(vscode.Uri.parse(AZURE_PORTAL_SUBSCRIPTIONS_URL));
        }
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

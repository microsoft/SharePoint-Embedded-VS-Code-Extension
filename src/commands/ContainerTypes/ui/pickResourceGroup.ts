/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ARMProvider } from '../../../services/ARM/ARMProvider';
import { ArmResourceGroupSummary } from '../../../services/ARM/SubscriptionService';

interface ResourceGroupQuickPickItem extends vscode.QuickPickItem {
    resourceGroup: ArmResourceGroupSummary;
}

/**
 * Prompts the user to pick an existing resource group in the given
 * subscription. Returns `undefined` if the user escapes or has no RGs.
 */
export async function pickResourceGroup(subscriptionId: string): Promise<ArmResourceGroupSummary | undefined> {
    const arm = ARMProvider.getInstance();

    let groups: ArmResourceGroupSummary[];
    try {
        groups = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Loading resource groups...') },
            () => arm.subscriptions.listResourceGroups(subscriptionId)
        );
    } catch (error: any) {
        vscode.window.showErrorMessage(
            vscode.l10n.t('Failed to load resource groups: {0}', error?.message ?? String(error))
        );
        return undefined;
    }

    if (groups.length === 0) {
        vscode.window.showErrorMessage(
            vscode.l10n.t('No resource groups found in this subscription. Create one in the Azure Portal and try again.')
        );
        return undefined;
    }

    const items: ResourceGroupQuickPickItem[] = groups.map(rg => ({
        resourceGroup: rg,
        label: rg.name,
        description: rg.location
    }));

    const picked = await vscode.window.showQuickPick<ResourceGroupQuickPickItem>(items, {
        title: vscode.l10n.t('Pick a resource group'),
        placeHolder: vscode.l10n.t('The Syntex billing account will be created in this resource group'),
        matchOnDescription: true,
        ignoreFocusOut: true
    });

    return picked?.resourceGroup;
}

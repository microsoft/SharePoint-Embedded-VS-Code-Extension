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

const AZURE_PORTAL_RESOURCE_GROUPS_URL = 'https://portal.azure.com/#blade/HubsExtension/BrowseResourceGroups';

// TODO(SPAC): consult Neha / Yogesh / Yashi for the correct client-side
// filter to apply (e.g. limit to RGs in Syntex-supported regions). Today we
// list everything and let the Syntex region check in
// attachBillingToContainerType reject unsupported RG locations.

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
        const openPortal = vscode.l10n.t('Open Azure portal');
        const choice = await vscode.window.showErrorMessage(
            vscode.l10n.t('No resource groups found in this subscription. Create a resource group in a SharePoint Embedded-supported region (e.g. East US, West Europe), then retry "Attach billing" from the container type\'s context menu.'),
            openPortal
        );
        if (choice === openPortal) {
            vscode.env.openExternal(vscode.Uri.parse(AZURE_PORTAL_RESOURCE_GROUPS_URL));
        }
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

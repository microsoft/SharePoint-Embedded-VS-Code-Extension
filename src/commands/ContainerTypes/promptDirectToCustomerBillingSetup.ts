/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ContainerType } from '../../models/schemas';
import { ContainerTypeRegistrationService } from '../../services/Graph/ContainerTypeRegistrationService';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';

const M365_ADMIN_PAYG_URL = 'https://admin.cloud.microsoft/?#/orgsettings/payasyougo';
const D2C_DOCS_URL = 'https://learn.microsoft.com/en-us/sharepoint/dev/embedded/administration/consuming-tenant-admin/cta#set-up-billing-for-passthrough-container-type';

/**
 * Run the post-registration billing prompt for a direct-to-customer container
 * type. The extension does not run an Azure/ARM flow for DTC — billing is set
 * up by the user-org admin per the SPE passthrough billing docs. This helper:
 *
 *   1. Re-reads the registration via Graph to get an authoritative
 *      billingStatus (the registration may have been created with no billing
 *      yet, or the tenant may already have SPE billing from a prior CT).
 *   2. If billingStatus is already 'valid', refreshes the tree and exits — no
 *      prompt needed, the tenant is already configured.
 *   3. Otherwise, shows an info toast with "Set up billing" (deep-link to the
 *      M365 admin Pay-As-You-Go page), "Learn more" (passthrough billing
 *      docs), and "Cancel".
 *
 * Failures fetching the registration are logged and swallowed — we still
 * surface the prompt as a fallback, since a stale `billingStatus: 'invalid'`
 * is the safer default to act on.
 */
export async function promptDirectToCustomerBillingSetup(
    registrationService: ContainerTypeRegistrationService,
    containerType: ContainerType
): Promise<void> {
    const ctName = containerType.name;
    let billingStatus: string | undefined;
    let isRegistered = false;
    const checkProgress = new ProgressWaitNotification(
        vscode.l10n.t('Checking billing status for "{0}"...', ctName)
    );
    checkProgress.show();
    try {
        const fresh = await registrationService.get(containerType.id);
        isRegistered = fresh !== null;
        billingStatus = fresh?.billingStatus;
    } catch (error: any) {
        console.warn('[promptDirectToCustomerBillingSetup] Failed to refresh registration billing status:', error);
    } finally {
        checkProgress.hide();
    }

    if (billingStatus === 'valid') {
        DevelopmentTreeViewProvider.instance.refresh();
        vscode.window.showInformationMessage(
            vscode.l10n.t('Container type "{0}" is registered and billing is already set up in this tenant.', ctName)
        );
        return;
    }

    DevelopmentTreeViewProvider.instance.refresh();

    const setUpBilling = vscode.l10n.t('Set up billing');
    const learnMore = vscode.l10n.t('Learn more');
    const cancel = vscode.l10n.t('Cancel');
    const promptMessage = isRegistered
        ? vscode.l10n.t(
            'Container type "{0}" is registered, but pay-as-you-go billing for SharePoint Embedded is not set up in this tenant. Set it up in the Microsoft 365 admin center to start using the container type.',
            ctName
        )
        : vscode.l10n.t(
            'Container type "{0}" needs pay-as-you-go billing for SharePoint Embedded set up in this tenant. Set it up in the Microsoft 365 admin center to start using the container type.',
            ctName
        );
    const choice = await vscode.window.showInformationMessage(
        promptMessage,
        setUpBilling,
        learnMore,
        cancel
    );
    if (choice === setUpBilling) {
        vscode.env.openExternal(vscode.Uri.parse(M365_ADMIN_PAYG_URL));
    } else if (choice === learnMore) {
        vscode.env.openExternal(vscode.Uri.parse(D2C_DOCS_URL));
    }
}

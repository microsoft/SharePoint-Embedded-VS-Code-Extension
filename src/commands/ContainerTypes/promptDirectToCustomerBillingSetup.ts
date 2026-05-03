/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ContainerType } from '../../models/schemas';
import { ContainerTypeRegistrationService } from '../../services/Graph/ContainerTypeRegistrationService';
import { AuthenticationState } from '../../services/AuthenticationState';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';

const M365_ADMIN_BILLING_URL = 'https://admin.microsoft.com/Adminportal/Home#/BillingAccounts/billing-accounts';
const D2C_DOCS_URL = 'https://learn.microsoft.com/en-us/sharepoint/dev/embedded/administration/billing/billing';

/**
 * Run the post-registration billing prompt for a direct-to-customer container
 * type. The extension does not run an Azure/ARM flow for DTC — billing is set
 * up by the user-org admin in the Microsoft 365 admin center. This helper:
 *
 *   1. Re-reads the registration via Graph to get an authoritative
 *      billingStatus (the registration may have been created with no billing
 *      yet, or the tenant may already have SPE billing from a prior CT).
 *   2. If billingStatus is already 'valid', refreshes the tree and exits — no
 *      prompt needed, the tenant is already configured.
 *   3. Otherwise, branches on whether the signed-in user has the Global
 *      Administrator directory role:
 *      - GA: modal prompt with a primary action that deep-links to the M365
 *        admin center billing accounts page.
 *      - non-GA: info toast asking them to coordinate with their tenant GA,
 *        with a "Learn more" button to the SPE billing docs.
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
    try {
        const fresh = await registrationService.get(containerType.id);
        billingStatus = fresh?.billingStatus;
    } catch (error: any) {
        console.warn('[promptDirectToCustomerBillingSetup] Failed to refresh registration billing status:', error);
    }

    if (billingStatus === 'valid') {
        DevelopmentTreeViewProvider.instance.refresh();
        vscode.window.showInformationMessage(
            vscode.l10n.t('Container type "{0}" is registered and billing is already set up in this tenant.', ctName)
        );
        return;
    }

    DevelopmentTreeViewProvider.instance.refresh();

    const isGlobalAdmin = await AuthenticationState.isCurrentUserGlobalAdmin();

    if (isGlobalAdmin) {
        const setUpBilling = vscode.l10n.t('Set up billing in admin center');
        const learnMore = vscode.l10n.t('Learn more');
        const later = vscode.l10n.t('Later');
        const choice = await vscode.window.showInformationMessage(
            vscode.l10n.t(
                'Container type "{0}" is registered, but pay-as-you-go billing for SharePoint Embedded is not set up in this tenant. Set it up in the Microsoft 365 admin center to start using the container type.',
                ctName
            ),
            { modal: true },
            setUpBilling,
            learnMore,
            later
        );
        if (choice === setUpBilling) {
            vscode.env.openExternal(vscode.Uri.parse(M365_ADMIN_BILLING_URL));
        } else if (choice === learnMore) {
            vscode.env.openExternal(vscode.Uri.parse(D2C_DOCS_URL));
        }
        return;
    }

    const learnMore = vscode.l10n.t('Learn more');
    const choice = await vscode.window.showInformationMessage(
        vscode.l10n.t(
            'Container type "{0}" is registered, but pay-as-you-go billing for SharePoint Embedded isn\'t set up in this tenant yet. Ask your tenant\'s Global Administrator to configure it in the Microsoft 365 admin center.',
            ctName
        ),
        learnMore
    );
    if (choice === learnMore) {
        vscode.env.openExternal(vscode.Uri.parse(D2C_DOCS_URL));
    }
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ContainerType } from '../../models/schemas';
import { ARMProvider } from '../../services/ARM/ARMProvider';
import { TelemetryProvider } from '../../services/TelemetryProvider';
import {
    SyntexAccountProvisioningFailure,
    SyntexProviderRegistrationFailure
} from '../../models/telemetry/telemetry';
import { pickSubscription } from './ui/pickSubscription';
import { pickResourceGroup } from './ui/pickResourceGroup';
// TEMP: client-side region gate disabled — let ARM surface the canonical
// supported-region list via its 400 instead. Restore once SYNTEX_REGIONS
// is reconciled with ARM's current allow-list.
// import { isSyntexSupportedRegion } from './ui/pickRegion';
import { diagnoseArmError } from '../../services/ARM/diagnoseArmError';

export type AttachBillingResult = 'succeeded' | 'canceled' | 'failed';

const POLICY_BLOCK_DOCS_URL = 'https://learn.microsoft.com/microsoft-365/services/error-request-disallowed-by-policy';
const AZURE_RBAC_DOCS_URL = 'https://learn.microsoft.com/en-us/azure/role-based-access-control/role-assignments-portal';

/**
 * Runs the Azure billing setup for a container type that already exists in
 * Graph: pick subscription → pick resource group → register Microsoft.Syntex
 * → PUT Syntex account with identityId = containerType.id. Idempotent — the
 * Syntex account name is the container type id, so retries upsert.
 *
 * Per PM review the user does NOT pick a region: the resource group's region
 * is used, and if it isn't Syntex-supported the flow errors out with the
 * supported-region list rather than presenting another picker.
 *
 * Returns:
 *   'succeeded' — billing account is provisioned (Syntex account is Succeeded)
 *   'canceled'  — user escaped a picker; no error surface
 *   'failed'    — a permission/network/ARM error occurred; an error toast was shown
 */
export async function attachBillingToContainerType(
    containerType: ContainerType,
    displayName: string
): Promise<AttachBillingResult> {
    const arm = ARMProvider.getInstance();

    // 1. Subscription
    const subscription = await pickSubscription();
    if (!subscription) { return 'canceled'; }

    // 2. Permission check. A 403 on Microsoft.Authorization/permissions/read
    //    itself requires Reader+, so any failure to read permissions is
    //    itself diagnostic of insufficient access. Either outcome — thrown
    //    error or hasAccess=false — means billing setup can't succeed, so
    //    abort and tell the user what RBAC they need. The container type is
    //    already created at this point; the warning state on the tree row is
    //    the retry signal.
    let hasAccess = false;
    try {
        hasAccess = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Checking your access to the subscription...') },
            () => arm.subscriptions.hasSubscriptionContributorAccess(subscription.subscriptionId)
        );
    } catch (error: any) {
        console.warn('[attachBillingToContainerType] Permission pre-check errored, treating as no access:', error);
    }

    if (!hasAccess) {
        const docsAction = vscode.l10n.t('Open Azure RBAC docs');
        const choice = await vscode.window.showErrorMessage(
            vscode.l10n.t(
                'Your account needs Owner or Contributor on subscription "{0}" to set up billing for "{1}". Once an Azure admin grants the role, right-click the container type and choose "Attach billing" to retry.',
                subscription.displayName,
                displayName
            ),
            docsAction
        );
        if (choice === docsAction) {
            vscode.env.openExternal(vscode.Uri.parse(AZURE_RBAC_DOCS_URL));
        }
        return 'failed';
    }

    // 3. Resource group
    const resourceGroup = await pickResourceGroup(subscription.subscriptionId);
    if (!resourceGroup) { return 'canceled'; }

    // 3b. Billing account region. Microsoft.Syntex/accounts only supports a
    //     subset of Azure regions. TEMP: client-side gate disabled — let ARM
    //     surface the canonical supported-region list via its 400 response
    //     instead. The PUT below will fail with LocationNotAvailableForResourceType
    //     if the RG region is unsupported, and presentArmFailure will show
    //     the raw ARM message (which enumerates valid regions).
    // if (!isSyntexSupportedRegion(resourceGroup.location)) {
    //     vscode.window.showErrorMessage(
    //         vscode.l10n.t(
    //             'Resource group "{0}" is in {1}, which does not support SharePoint Embedded billing. Pick a different resource group, then retry "Attach billing" from the container type\'s context menu.',
    //             resourceGroup.name,
    //             resourceGroup.location
    //         )
    //     );
    //     return 'failed';
    // }
    const region = resourceGroup.location.toLowerCase();

    // 4. Register Microsoft.Syntex
    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: vscode.l10n.t('Preparing your Azure subscription for SPE billing (this may take up to 5 minutes)')
            },
            async () => {
                await arm.syntexProviders.register(subscription.subscriptionId);
                await arm.syntexProviders.waitForRegistered(subscription.subscriptionId);
            }
        );
    } catch (error: any) {
        TelemetryProvider.instance.send(new SyntexProviderRegistrationFailure(error));
        await presentArmFailure(error, 'providerRegistration');
        return 'failed';
    }

    // 5. PUT Syntex account + wait for Succeeded
    const accountName = containerType.id;
    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: vscode.l10n.t('Provisioning Azure billing account...')
            },
            async (progress) => {
                await arm.syntexAccounts.putAccount(
                    subscription.subscriptionId,
                    resourceGroup.name,
                    accountName,
                    {
                        location: region,
                        properties: {
                            friendlyName: displayName,
                            identityId: containerType.id,
                            identityType: 'ContainerType',
                            service: 'SPO',
                            feature: 'RaaS',
                            scope: 'Global'
                        }
                    }
                );
                await arm.syntexAccounts.waitForSucceeded(
                    subscription.subscriptionId,
                    resourceGroup.name,
                    accountName,
                    { onStateChange: (state) => progress.report({ message: state }) }
                );
            }
        );
    } catch (error: any) {
        TelemetryProvider.instance.send(new SyntexAccountProvisioningFailure(error));
        await presentArmFailure(error, 'accountProvisioning');
        return 'failed';
    }

    return 'succeeded';
}

type FailureStage = 'providerRegistration' | 'accountProvisioning';

/**
 * Show a tailored error message for an ARM failure during billing attach.
 * Distinguishes the three meaningful cases:
 *   - Azure Policy denying the resource type (RequestDisallowedByPolicy)
 *   - Caller lacks RBAC (AuthorizationFailed)
 *   - Anything else: generic copy with the raw ARM message
 */
async function presentArmFailure(error: any, stage: FailureStage): Promise<void> {
    const diag = diagnoseArmError(error);
    const rawMessage = error?.message ?? String(error);

    if (diag.kind === 'policyBlocked') {
        const targetType = diag.targetType ?? 'Microsoft.Syntex/accounts';
        const policyClause = diag.policyName
            ? vscode.l10n.t('The Azure policy "{0}" doesn\'t allow the {1} resource type. Update the "{0}" policy to allow {1}, then retry attaching billing.', diag.policyName, targetType)
            : vscode.l10n.t('An Azure policy doesn\'t allow the {0} resource type. Update the policy to allow {0}, then retry attaching billing.', targetType);
        const learnMore = vscode.l10n.t('Learn more');
        const choice = await vscode.window.showErrorMessage(policyClause, learnMore);
        if (choice === learnMore) {
            vscode.env.openExternal(vscode.Uri.parse(POLICY_BLOCK_DOCS_URL));
        }
        return;
    }

    if (diag.kind === 'rbacInsufficient') {
        const learnMore = vscode.l10n.t('Open Azure RBAC docs');
        const choice = await vscode.window.showErrorMessage(
            vscode.l10n.t('Your account doesn\'t have the Azure role needed for this step. Ask an Azure admin to grant Owner or Contributor on the subscription, then retry "Attach billing" from the container type\'s context menu.'),
            learnMore
        );
        if (choice === learnMore) {
            vscode.env.openExternal(vscode.Uri.parse(AZURE_RBAC_DOCS_URL));
        }
        return;
    }

    if (diag.kind === 'regionConflict') {
        // The Syntex account name is deterministic (containerType.id), so the
        // user has previously created it in another RG/region. Steer them to
        // the original RG rather than letting them retry against a fresh one.
        const where = diag.existingLocation
            ? vscode.l10n.t('an Azure resource group in {0}', diag.existingLocation)
            : vscode.l10n.t('the resource group it was originally created in');
        vscode.window.showErrorMessage(
            vscode.l10n.t(
                'A Syntex billing account for this container type already exists in {0}. Re-run "Attach billing" and pick that resource group, or have an Azure admin delete the existing account first.',
                where
            )
        );
        return;
    }

    if (diag.kind === 'spoTenantConflict') {
        vscode.window.showErrorMessage(
            vscode.l10n.t('This Azure resource group is already linked to a different SharePoint tenant\'s Syntex billing account. Pick a different resource group, or have an Azure admin delete the existing account first.')
        );
        return;
    }

    if (diag.kind === 'tenantSettingsUnreadable') {
        vscode.window.showErrorMessage(
            vscode.l10n.t('Azure couldn\'t read the SharePoint tenant settings for this subscription. Make sure you\'re signed in to the same tenant that owns the container type, then retry "Attach billing".')
        );
        return;
    }

    const fallback = stage === 'providerRegistration'
        ? vscode.l10n.t('Failed to register Microsoft.Syntex: {0}', rawMessage)
        : vscode.l10n.t('Failed to provision Azure billing account: {0}', rawMessage);
    vscode.window.showErrorMessage(fallback);
}

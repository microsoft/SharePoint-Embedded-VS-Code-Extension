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
import { pickSyntexRegion } from './ui/pickRegion';

export type AttachBillingResult = 'succeeded' | 'canceled' | 'failed';

/**
 * Runs the Azure billing setup for a container type that already exists in
 * Graph: pick subscription → pick resource group → register Microsoft.Syntex
 * → PUT Syntex account with identityId = containerType.id. Idempotent — the
 * Syntex account name is derived deterministically from the display name +
 * container type id, so retries upsert the same resource.
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
    //    abort and tell the user what RBAC they need.
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
                'Your account needs Owner or Contributor rights on subscription "{0}" to set up billing. Ask your Azure admin to grant the role, then attach billing again from the container type\'s context menu.',
                subscription.displayName
            ),
            docsAction
        );
        if (choice === docsAction) {
            vscode.env.openExternal(vscode.Uri.parse('https://learn.microsoft.com/en-us/azure/role-based-access-control/role-assignments-portal'));
        }
        return 'failed';
    }

    // 3. Resource group
    const resourceGroup = await pickResourceGroup(subscription.subscriptionId);
    if (!resourceGroup) { return 'canceled'; }

    // 3b. Billing account region. Microsoft.Syntex/accounts supports only a
    //     subset of Azure regions, so if the RG's region isn't supported we
    //     prompt the user to pick one that is. (The resource group itself
    //     can be in any region; only the Syntex account inside it is
    //     constrained.)
    const region = await pickSyntexRegion(resourceGroup.location);
    if (!region) { return 'canceled'; }

    // 4. Register Microsoft.Syntex
    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: vscode.l10n.t('Registering Microsoft.Syntex on the subscription...')
            },
            async (progress) => {
                await arm.syntexProviders.register(subscription.subscriptionId);
                await arm.syntexProviders.waitForRegistered(subscription.subscriptionId, {
                    onStateChange: (state) => progress.report({ message: state })
                });
            }
        );
    } catch (error: any) {
        TelemetryProvider.instance.send(new SyntexProviderRegistrationFailure(error));
        vscode.window.showErrorMessage(
            vscode.l10n.t('Failed to register Microsoft.Syntex: {0}', error?.message ?? String(error))
        );
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
        vscode.window.showErrorMessage(
            vscode.l10n.t('Failed to provision Azure billing account: {0}', error?.message ?? String(error))
        );
        return 'failed';
    }

    return 'succeeded';
}


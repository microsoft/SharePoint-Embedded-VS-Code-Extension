/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
    Application,
    ContainerType,
    User
} from '../../models/schemas';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { ProgressWaitNotification, Timer } from '../../views/notifications/ProgressWaitNotification';
import { TelemetryProvider } from '../../services/TelemetryProvider';
import {
    CreateStandardContainerTypeEvent,
    StandardContainerTypeCreationFailure
} from '../../models/telemetry/telemetry';
import { attachBillingToContainerType } from './attachBillingToContainerType';

export interface StandardFlowInput {
    displayName: string;
    app: Application;
    owners: User[];
}

/**
 * Create a Standard (paid, owner-org billed) container type. The Graph
 * container type is created first; Azure billing setup is best-effort. If
 * the user can't or won't complete the Azure side (no subscription access,
 * picker escape, ARM error), the container type still exists — it's just
 * unusable until billing is attached via the tree context menu.
 */
export async function runStandardFlow(input: StandardFlowInput): Promise<ContainerType | undefined> {
    const graphProvider = GraphProvider.getInstance();

    // 1. Create the container type
    const createProgress = new ProgressWaitNotification(
        vscode.l10n.t('Creating container type (may take up to 30 seconds)...')
    );
    createProgress.show();
    const ctTimer = new Timer(30 * 1000);

    let containerType: ContainerType | undefined;
    let lastCreateError: any;
    do {
        try {
            containerType = await graphProvider.containerTypes.create({
                name: input.displayName,
                owningAppId: input.app.appId!,
                billingClassification: 'standard',
                settings: { isDiscoverabilityEnabled: false }
            });
        } catch (error) {
            lastCreateError = error;
        }
    } while (!containerType && !ctTimer.finished);

    createProgress.hide();

    if (!containerType) {
        TelemetryProvider.instance.send(new StandardContainerTypeCreationFailure(lastCreateError));
        vscode.window.showErrorMessage(
            vscode.l10n.t('Failed to create container type: {0}', lastCreateError?.message ?? String(lastCreateError))
        );
        return;
    }

    // 2. Entra app owners (best-effort)
    if (input.owners.length > 0 && input.app.id) {
        try {
            const { failed } = await graphProvider.applications.addOwners(input.app.id, input.owners.map(o => o.id));
            if (failed.length > 0) {
                vscode.window.showWarningMessage(
                    vscode.l10n.t('{0} owner(s) could not be added to the Entra app.', failed.length)
                );
            }
        } catch (error: any) {
            vscode.window.showWarningMessage(
                vscode.l10n.t('Failed to add owners to the Entra app: {0}', error?.message ?? String(error))
            );
        }
    }

    // 3. Add container-type owner permissions (best-effort, beta API).
    //    Graph requires one POST per owner; max 3 per container type.
    if (input.owners.length > 0) {
        const failedOwners: string[] = [];
        for (const owner of input.owners) {
            try {
                await graphProvider.containerTypes.addOwner(containerType.id, owner.id);
            } catch (error: any) {
                console.warn(`[runStandardFlow] Failed to add owner ${owner.id}:`, error);
                failedOwners.push(owner.displayName ?? owner.id);
            }
        }
        if (failedOwners.length > 0) {
            vscode.window.showWarningMessage(
                vscode.l10n.t('Could not add {0} as owner(s) on the container type.', failedOwners.join(', '))
            );
        }
    }

    // 4. Refresh tree so the new (still-unbilled) CT is visible
    const ctRefreshTimer = new Timer(60 * 1000);
    DevelopmentTreeViewProvider.instance.refresh();
    do {
        const children = await DevelopmentTreeViewProvider.instance.getChildren();
        if (children && children.length > 0) { break; }
        await new Promise(r => setTimeout(r, 5000));
    } while (!ctRefreshTimer.finished);
    DevelopmentTreeViewProvider.instance.refresh();

    TelemetryProvider.instance.send(new CreateStandardContainerTypeEvent());

    // 4. Attempt Azure billing setup. Any failure keeps the CT; the user can
    //    attach billing later from the tree context menu.
    const billingResult = await attachBillingToContainerType(containerType, input.displayName);

    if (billingResult === 'succeeded') {
        DevelopmentTreeViewProvider.instance.refresh();
        vscode.window.showInformationMessage(
            vscode.l10n.t('Standard container type "{0}" was created and billing is attached.', input.displayName)
        );
        return containerType;
    }

    // Billing not attached — nudge the user with a retry action
    const attachNow = vscode.l10n.t('Attach billing now');
    const later = vscode.l10n.t('Later');
    const choice = await vscode.window.showWarningMessage(
        vscode.l10n.t(
            'Container type "{0}" was created, but Azure billing isn\'t set up. The container type can\'t be used until billing is attached. You can attach billing later by right-clicking the container type in the tree.',
            input.displayName
        ),
        attachNow,
        later
    );
    if (choice === attachNow) {
        const retry = await attachBillingToContainerType(containerType, input.displayName);
        if (retry === 'succeeded') {
            DevelopmentTreeViewProvider.instance.refresh();
            vscode.window.showInformationMessage(
                vscode.l10n.t('Billing attached to container type "{0}".', input.displayName)
            );
        }
    }

    return containerType;
}

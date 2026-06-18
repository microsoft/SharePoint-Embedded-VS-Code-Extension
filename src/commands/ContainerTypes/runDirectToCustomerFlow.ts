/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
    Application,
    ContainerType
} from '../../models/schemas';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { ProgressWaitNotification, Timer } from '../../views/notifications/ProgressWaitNotification';
import { TelemetryProvider } from '../../services/TelemetryProvider';
import {
    CreateDirectToCustomerContainerTypeEvent,
    DirectToCustomerContainerTypeCreationFailure
} from '../../models/telemetry/telemetry';
import { RegisterOnLocalTenant } from '../ContainerType/RegisterOnLocalTenant';
import { promptDirectToCustomerBillingSetup } from './promptDirectToCustomerBillingSetup';

const D2C_DOCS_URL = 'https://learn.microsoft.com/en-us/sharepoint/dev/embedded/administration/billing/billing';

export interface DirectToCustomerFlowInput {
    displayName: string;
    app: Application;
}

/**
 * Direct-to-customer (user-org billed) container type creation. No ARM
 * dependency and no SPO REST — if the tenant hasn't enabled D2C billing,
 * the Graph create call will fail and we translate the error into an
 * actionable message with a docs link.
 */
export async function runDirectToCustomerFlow(input: DirectToCustomerFlowInput): Promise<ContainerType | undefined> {
    const graphProvider = GraphProvider.getInstance();
    const progress = new ProgressWaitNotification(
        vscode.l10n.t('Creating container type (may take up to 30 seconds)...')
    );
    progress.show();
    const ctTimer = new Timer(30 * 1000);

    let containerType: ContainerType | undefined;
    let lastError: any;
    do {
        try {
            containerType = await graphProvider.containerTypes.create({
                name: input.displayName,
                owningAppId: input.app.appId!,
                billingClassification: 'directToCustomer',
                settings: { isDiscoverabilityEnabled: false }
            });
        } catch (error: any) {
            lastError = error;
            if (looksLikeTenantFlagDisabled(error)) {
                break;
            }
        }
    } while (!containerType && !ctTimer.finished);

    if (!containerType) {
        progress.hide();
        TelemetryProvider.instance.send(new DirectToCustomerContainerTypeCreationFailure(lastError));
        if (looksLikeTenantFlagDisabled(lastError)) {
            const openDocs = vscode.l10n.t('Open billing docs');
            const choice = await vscode.window.showErrorMessage(
                vscode.l10n.t('Direct-to-customer billing isn\'t enabled for this tenant. An admin must enable it before creating a direct-to-customer container type.'),
                openDocs
            );
            if (choice === openDocs) {
                vscode.env.openExternal(vscode.Uri.parse(D2C_DOCS_URL));
            }
        } else {
            vscode.window.showErrorMessage(
                vscode.l10n.t('Failed to create container type: {0}', lastError?.message ?? String(lastError))
            );
        }
        return;
    }

    // Refresh tree
    const ctRefreshTimer = new Timer(60 * 1000);
    DevelopmentTreeViewProvider.instance.refresh();
    do {
        const children = await DevelopmentTreeViewProvider.instance.getChildren();
        if (children && children.length > 0) { break; }
        await new Promise(r => setTimeout(r, 5000));
    } while (!ctRefreshTimer.finished);
    DevelopmentTreeViewProvider.instance.refresh();
    progress.hide();

    TelemetryProvider.instance.send(new CreateDirectToCustomerContainerTypeEvent());

    // Offer registration on local tenant. Mirrors the trial flow's prompt.
    // Errors are caught so the billing prompt still runs unconditionally.
    const register = vscode.l10n.t('Register on local tenant');
    const skip = vscode.l10n.t('Skip');
    const registerSelection = await vscode.window.showInformationMessage(
        vscode.l10n.t('Direct-to-customer container type "{0}" was created. Would you like to register it on your local tenant?', input.displayName),
        register,
        skip
    );
    if (registerSelection === register) {
        try {
            await RegisterOnLocalTenant.run(containerType);
        } catch (err) {
            console.error('[runDirectToCustomerFlow] Registration threw:', err);
        }
    }
    DevelopmentTreeViewProvider.instance.refresh();

    await promptDirectToCustomerBillingSetup(graphProvider.registrations, containerType);
    return containerType;
}

/**
 * Heuristic: detect Graph errors that indicate direct-to-customer billing
 * is not enabled for the tenant. The exact error shape isn't formally
 * documented, so we match loosely on status + message text.
 */
function looksLikeTenantFlagDisabled(error: any): boolean {
    if (!error) { return false; }
    const status = error?.statusCode ?? error?.status ?? error?.response?.status;
    const message = [
        error?.message,
        error?.body?.error?.message,
        error?.response?.data?.error?.message,
        error?.response?.data?.['odata.error']?.message?.value
    ].filter(Boolean).join(' ').toLowerCase();

    if (status === 403 || status === 400) {
        if (
            message.includes('directtocustomer') ||
            message.includes('direct-to-customer') ||
            message.includes('not enabled') ||
            message.includes('billing') && message.includes('enable')
        ) {
            return true;
        }
    }
    return false;
}

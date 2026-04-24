/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { ContainerType } from '../../models/schemas';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { AuthenticationState } from '../../services/AuthenticationState';
import { GetOrCreateApp } from '../Apps/GetOrCreateApp';
import { RegisterOnLocalTenant } from '../ContainerType/RegisterOnLocalTenant';
import { ProgressWaitNotification, Timer } from '../../views/notifications/ProgressWaitNotification';
import { Application, User } from '../../models/schemas';
import { CreateTrialContainerTypeEvent, TrialContainerTypeCreationFailure } from '../../models/telemetry/telemetry';
import { TelemetryProvider } from '../../services/TelemetryProvider';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { promptForContainerTypeDisplayName } from './ui/promptForContainerTypeDisplayName';

export interface TrialFlowInput {
    /** Display name for the container type. If omitted, the user will be prompted. */
    displayName?: string;
    /** Owning Entra app. If omitted, the app picker will be shown. */
    app?: Application;
    /** Optional tenant users to add as owners of the Entra app after creation. */
    owners?: User[];
}

/**
 * Runs the trial container type creation flow. Exported so the unified
 * `CreateContainerType` entry command can call it without re-prompting
 * the user for display name / app when those have already been collected.
 */
export async function runTrialFlow(input?: TrialFlowInput): Promise<ContainerType | undefined> {
    const isSignedIn = await AuthenticationState.isSignedIn();
    if (!isSignedIn) {
        vscode.window.showErrorMessage(vscode.l10n.t('Please sign in to create a trial container type.'));
        return;
    }

    const account = await AuthenticationState.getCurrentAccount();
    if (!account) {
        vscode.window.showErrorMessage(vscode.l10n.t('Authentication not available. Please try signing in again.'));
        return;
    }

    const graphProvider = GraphProvider.getInstance();

    let displayName = input?.displayName;
    if (!displayName) {
        displayName = await promptForContainerTypeDisplayName();
        if (!displayName) {
            return;
        }
    }

    let app = input?.app;
    if (!app) {
        app = await GetOrCreateApp.run(true); // true for owning app
        if (!app) {
            return;
        }
    }

    const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Creating container type (may take up to 30 seconds)...'));
    progressWindow.show();
    const ctTimer = new Timer(30 * 1000);

    let containerType: ContainerType | undefined;
    let ctCreationError: any;
    do {
        try {
            const containerTypeData = {
                name: displayName,
                owningAppId: app.appId!,
                billingClassification: 'trial' as const,
                billingStatus: 'valid' as const,
                settings: {
                    isDiscoverabilityEnabled: false
                }
            };

            containerType = await graphProvider.containerTypes.create(containerTypeData);
            if (!containerType) {
                throw new Error();
            }
        } catch (error) {
            ctCreationError = error;
            const maxCTMessage = 'Maximum number of allowed Trial Container Types has been exceeded.';
            if (ctCreationError?.response?.data?.['odata.error']?.message?.value === maxCTMessage) {
                ctCreationError = maxCTMessage;
                break;
            }
        }
    } while (!containerType && !ctTimer.finished);

    if (!containerType) {
        progressWindow.hide();
        let errorMessage = vscode.l10n.t('Failed to create container type');
        if (ctCreationError) {
            errorMessage += `: ${ctCreationError}`;
        }
        vscode.window.showErrorMessage(errorMessage);
        TelemetryProvider.instance.send(new TrialContainerTypeCreationFailure(errorMessage));
        return;
    }

    // Assign tenant owners on the Entra app if the caller collected any.
    // Failures here don't abort the flow — the container type is already created.
    if (input?.owners && input.owners.length > 0 && app.id) {
        try {
            const { failed } = await graphProvider.applications.addOwners(app.id, input.owners.map(o => o.id));
            if (failed.length > 0) {
                vscode.window.showWarningMessage(
                    vscode.l10n.t('Created container type, but {0} owner(s) could not be added to the app.', failed.length)
                );
            }
        } catch (error: any) {
            vscode.window.showWarningMessage(
                vscode.l10n.t('Created container type, but failed to add owners to the app: {0}', error?.message ?? String(error))
            );
        }
    }

    const ctRefreshTimer = new Timer(60 * 1000);
    const refreshCt = async (): Promise<void> => {
        DevelopmentTreeViewProvider.instance.refresh();
        do {
            const children = await DevelopmentTreeViewProvider.instance.getChildren();
            if (children && children.length > 0) {
                break;
            }
            // sleep for 5 seconds
            await new Promise(r => setTimeout(r, 5000));
        } while (!ctRefreshTimer.finished);
        DevelopmentTreeViewProvider.instance.refresh();
    };
    await refreshCt();
    progressWindow.hide();
    const register = vscode.l10n.t('Register on local tenant');
    const skip = vscode.l10n.t('Skip');
    const buttons = [register, skip];
    const selection = await vscode.window.showInformationMessage(
        vscode.l10n.t(`Your container type has been created. Would you like to register it on your local tenant?`),
        ...buttons
    );
    if (selection === register) {
        await RegisterOnLocalTenant.run(containerType);
    }
    TelemetryProvider.instance.send(new CreateTrialContainerTypeEvent());
    return containerType;
}

// Static class that handles the create trial container type command.
// Kept for backward compatibility with the `spe.ContainerTypes.createTrial`
// command id; the user-facing entry point is now `CreateContainerType`.
export class CreateTrialContainerType extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerTypes.createTrial';

    // Command handler
    public static async run(): Promise<ContainerType | undefined> {
        return runTrialFlow();
    }
}

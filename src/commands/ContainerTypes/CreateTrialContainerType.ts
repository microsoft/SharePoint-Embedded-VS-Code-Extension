/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { ContainerType } from '../../models/schemas';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { AuthenticationState } from '../../services/AuthenticationState';
import { GraphAuthProvider } from '../../services/Auth';
import { GraphProvider } from '../../services/Graph';
import { GetOrCreateApp } from '../Apps/GetOrCreateApp';
// import { RegisterOnLocalTenant } from '../ContainerType/RegisterOnLocalTenant';
import { ProgressWaitNotification, Timer } from '../../views/notifications/ProgressWaitNotification';
import { Application } from '../../models/schemas';
import { CreateTrialContainerTypeEvent, TrialContainerTypeCreationFailure } from '../../models/telemetry/telemetry';
import { TelemetryProvider } from '../../services/TelemetryProvider';

// Static class that handles the create trial container type command
export class CreateTrialContainerType extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerTypes.createTrial';

    // Command handler
    public static async run(): Promise<ContainerType | undefined> {
        const isSignedIn = await AuthenticationState.isSignedIn();
        if (!isSignedIn) {
            vscode.window.showErrorMessage('Please sign in to create a trial container type.');
            return;
        }

        const account = await AuthenticationState.getCurrentAccount();
        if (!account) {
            vscode.window.showErrorMessage('Authentication not available. Please try signing in again.');
            return;
        }

        const graphProvider = GraphProvider.getInstance();

        const displayName = await vscode.window.showInputBox({
            placeHolder: vscode.l10n.t('Enter a display name for your new container type'),
            prompt: vscode.l10n.t('Container type display name'),
            validateInput: (value: string) => {
                const maxLength = 50;
                const alphanumericRegex = /^[a-zA-Z0-9\s-_]+$/;
                if (!value) {
                    return vscode.l10n.t('Display name cannot be empty');
                }

                if (value.length > maxLength) {
                    return vscode.l10n.t(`Display name must be no more than {0} characters long`, maxLength);
                }

                if (!alphanumericRegex.test(value)) {
                    return vscode.l10n.t('Display name must only contain alphanumeric characters');
                }
                return undefined;
            }
        });
        if (!displayName) {
            return;
        }

        const app = await GetOrCreateApp.run(true); // true for owning app
        if (!app) {
            return;
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
            // TODO: Update RegisterOnLocalTenant to use new authentication system
            // RegisterOnLocalTenant.run(containerType);
            vscode.window.showInformationMessage('Container type registration will be available after the authentication system migration.');
        }
        TelemetryProvider.instance.send(new CreateTrialContainerTypeEvent());
        return containerType;
    }
}


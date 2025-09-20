/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { ProgressWaitNotification, Timer } from '../../views/notifications/ProgressWaitNotification';
import { ContainerType } from '../../models/schemas';
import { GraphAuthProvider } from '../../services/Auth';
import { GraphProvider } from '../../services/Graph';
import { AuthenticationState } from '../../services/AuthenticationState';
import { ActiveContainersError, ActiveRecycledContainersError } from '../../utils/errors';
import { TelemetryProvider } from '../../services/TelemetryProvider';
import { DeleteTrialContainerType, TrialContainerTypeDeletionFailure } from '../../models/telemetry/telemetry';

// Static class that handles the delete container type command
export class DeleteContainerType extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.delete';

    // Command handler
    public static async run(commandProps?: DeletionCommandProps): Promise<void> {
        if (!commandProps) {
            return;
        }

        // Get authentication and check admin status
        const account = await AuthenticationState.getCurrentAccount();
        if (!account) {
            vscode.window.showErrorMessage(vscode.l10n.t('Please sign in first'));
            return;
        }

        // Get Graph provider
        const graphAuth = GraphAuthProvider.getInstance();
        const graphProvider = GraphProvider.getInstance();

        let containerType: ContainerType;
        if (commandProps instanceof ContainerTypeTreeItem) {
            containerType = commandProps.containerType;
        } else {
            containerType = commandProps;
        }
        if (!containerType) {
            return;
        }

        const message = `Are you sure you delete the '${containerType.name}' Container Type?`;
        const userChoice = await vscode.window.showInformationMessage(
            message,
            vscode.l10n.t('OK'), vscode.l10n.t('Cancel')
        );

        if (userChoice !== vscode.l10n.t('OK')) {
            return;
        }

        const progressWindow = new ProgressWaitNotification('Deleting container type (make take a minute)...');
        try {    
            progressWindow.show();
            
            // Use the new service to delete the container type
            await graphProvider.containerTypes.delete(containerType.id);
            
            const ctRefreshTimer = new Timer(60 * 1000);
            const refreshCt = async (): Promise<void> => {
                DevelopmentTreeViewProvider.instance.refresh();
                do {
                    const containerTypes = await graphProvider.containerTypes.list();
                    if (!containerTypes.find((ct: ContainerType) => ct.id === containerType.id)) {
                        break;
                    }
                    // sleep for 5 seconds
                    await new Promise(r => setTimeout(r, 5000));
                } while (!ctRefreshTimer.finished);
                progressWindow.hide();
                DevelopmentTreeViewProvider.instance.refresh();
                TelemetryProvider.instance.send(new DeleteTrialContainerType());
            };
            refreshCt();
        } catch (error: any) {
            let errorDisplayMessage;
            if (error.response && error.response.status === 400) {
                const errorMessage = error.response.data && 
                error.response.data['odata.error'] && 
                error.response.data['odata.error'].message ? 
                error.response.data['odata.error'].message.value : error.message;

                switch (errorMessage) {
                    case ActiveContainersError.serverMessage:
                        errorDisplayMessage = ActiveContainersError.uiMessage;
                        break;
                    case ActiveRecycledContainersError.serverMessage:
                        errorDisplayMessage = ActiveRecycledContainersError.uiMessage;
                        break;
                    default:
                        errorDisplayMessage = error.message;
                        break;
                }
            }
            vscode.window.showErrorMessage(`Unable to delete Container Type ${containerType.name} : ${errorDisplayMessage || error.message}`);
            TelemetryProvider.instance.send(new TrialContainerTypeDeletionFailure(errorDisplayMessage || error.message));
            progressWindow.hide();
            return;
        }
    }
}

export type DeletionCommandProps = ContainerTypeTreeItem | ContainerType;

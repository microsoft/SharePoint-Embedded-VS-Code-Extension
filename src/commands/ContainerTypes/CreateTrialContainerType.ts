/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { Account } from '../../models/Account';
import { BillingClassification, ContainerType } from '../../models/ContainerType';
import { ContainerTypeCreationFlow, ContainerTypeCreationFlowState } from '../../views/qp/UxFlows';
import { ProgressNotification } from '../../views/notifications/ProgressNotification';
import { App } from '../../models/App';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { GetAccount } from '../Accounts/GetAccount';
import { GetOrCreateApp } from '../Apps/GetOrCreateApp';
import { RegisterOnLocalTenant } from '../ContainerType/RegisterOnLocalTenant';
import { clear } from 'console';
import { ProgressNotificationNew } from '../../views/notifications/ProgressNotificationNew';

// Static class that handles the create trial container type command
export class CreateTrialContainerType extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerTypes.createTrial';



    // Command handler
    public static async run(): Promise<ContainerType | undefined> {
        const account = await GetAccount.run();
        if (!account) {
            return;
        }

        const displayName = await vscode.window.showInputBox({
            placeHolder: 'Enter a display name for your new container type',
            prompt: 'Container type display name',
            validateInput: (value: string) => {
                if (!value) {
                    return 'diplay name is required';
                }
                return undefined;
            }
        });
        if (!displayName) {
            return;
        }

        const app = await GetOrCreateApp.run();
        if (!app) {
            return;
        }

        try {
            
            const progressPromise = new ProgressNotificationNew('Creating container type', 10).show();
            const containerTypeProvider = account.containerTypeProvider;
            const containerType = await containerTypeProvider.createTrial(displayName, app.clientId);
            if (!containerType) {
                throw new Error();
            }
            await progressPromise;
            //await new ProgressNotification().show();

            let remainingAttempts = 5;
            let waittime = 2000;
            const interval = setInterval(async () => {
                if (remainingAttempts-- === 0) {
                    clearInterval(interval);
                }
                const containerTypes = await containerTypeProvider.list();
                if (containerTypes.find(ct => ct.containerTypeId === containerType.containerTypeId)) {
                    clearInterval(interval);
                    DevelopmentTreeViewProvider.instance.refresh();
                }
            }, waittime);
            setTimeout(() => {
                DevelopmentTreeViewProvider.instance.refresh();
            }, 2000);
            

            const register = 'Register on local tenant';
            const buttons = [register];
            vscode.window.showInformationMessage(
                `Your container type has been created. Would you like to register it on your local tenant?`,
                ...buttons
            ).then(async (selection) => {
                if (selection === register) {
                    RegisterOnLocalTenant.run(containerType);
                }
            });

            return containerType;
        } catch (error) {
            //TODO: Specifically handle free container type limit error
            vscode.window.showErrorMessage(`Failed to create container type: ${error}`);
        }
        
    }
}


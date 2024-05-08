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
import { ProgressWaitNotification, Timer } from '../../views/notifications/ProgressWaitNotification';

// Static class that handles the create standard container type command
export class CreatePaidContainerType extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerTypes.createPaid';

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
                    return 'display name is required';
                }
                return undefined;
            }
        });
        if (!displayName) {
            return;
        }
        
        //TODO: Get the Azure subscription Id, resource group, and region from Graph API
        const azureSubscriptionId = await vscode.window.showInputBox({
            placeHolder: 'Enter the Azure subscription Id of your billing profile',
            prompt: 'Azure subscription Id',
            validateInput: (value: string) => {
                if (!value) {
                    return 'Azure Subscription Id is required';
                }
                return undefined;
            }
        });
        if (!azureSubscriptionId) {
            return;
        }

        const resourceGroup = await vscode.window.showInputBox({
            placeHolder: 'Enter the resource group of your billing profile',
            prompt: 'Resource group',
            validateInput: (value: string) => {
                if (!value) {
                    return 'Resource group is required';
                }
                return undefined;
            }
        });
        if (!resourceGroup) {
            return;
        }

        const region = await vscode.window.showInputBox({
            placeHolder: 'Enter the region of your billing profile',
            prompt: 'Region',
            validateInput: (value: string) => {
                if (!value) {
                    return 'Region is required';
                }
                return undefined;
            }
        });
        if (!region) {
            return;
        }

        const app = await GetOrCreateApp.run();
        if (!app) {
            return;
        }


        const progressWindow = new ProgressWaitNotification('Creating container type');
        progressWindow.show();
        const ctTimer = new Timer(30 * 1000);
        const containerTypeProvider = account.containerTypeProvider;
        let containerType: ContainerType | undefined;
        do {
            try {
                containerType = await containerTypeProvider.createPaid(displayName, azureSubscriptionId, resourceGroup, region, app.clientId);
                if (!containerType) {
                    throw new Error();
                } 
            } catch (error) {
                console.log(error);
            }
        } while (!containerType && !ctTimer.finished);

        if (!containerType) {
            vscode.window.showErrorMessage('Failed to create container type');
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

        //TODO: Attach Billing profile to CT

        

        const register = 'Register on local tenant';
        const buttons = [register];
        const selection = await vscode.window.showInformationMessage(
            `Your container type has been created. Would you like to register it on your local tenant?`,
            ...buttons
        );
        if (selection === register) {
            RegisterOnLocalTenant.run(containerType);
        }
        return containerType;        
    }
}


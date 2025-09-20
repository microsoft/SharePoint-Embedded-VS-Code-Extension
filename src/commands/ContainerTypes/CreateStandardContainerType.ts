/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { ContainerType } from '../../models/ContainerType';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { GetAccount } from '../Accounts/GetAccount';
import { GetOrCreateApp } from '../Apps/GetOrCreateApp';
import { RegisterOnLocalTenant } from '../ContainerType/RegisterOnLocalTenant';
import { ProgressWaitNotification, Timer } from '../../views/notifications/ProgressWaitNotification';
import { DeleteContainerType } from '../ContainerType/DeleteContainerType';
import { AppType } from '../../models/App';

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
            placeHolder: vscode.l10n.t('Enter a display name for your new container type'),
            prompt: vscode.l10n.t('Container type display name'),
            ignoreFocusOut: true,
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

        //TODO: Get the Azure subscription Id, resource group, and region from Graph API
        const azureSubscriptionId = await vscode.window.showInputBox({
            placeHolder: vscode.l10n.t('Enter the Azure subscription Id of your billing profile'),
            prompt: vscode.l10n.t('Azure Subscription Id'),
            ignoreFocusOut: true,
            validateInput: (value: string) => {
                if (!value) {
                    return vscode.l10n.t('Azure Subscription Id is required');
                }
                return undefined;
            }
        });

        if (!azureSubscriptionId) {
            return;
        }

        const resourceGroup = await vscode.window.showInputBox({
            placeHolder: vscode.l10n.t('Enter the resource group of your billing profile'),
            prompt: vscode.l10n.t('Resource group'),
            ignoreFocusOut: true,
            validateInput: (value: string) => {
                if (!value) {
                    return vscode.l10n.t('Resource group is required');
                }
                return undefined;
            }
        });

        if (!resourceGroup) {
            return;
        }

        const region = await vscode.window.showInputBox({
            placeHolder: vscode.l10n.t('Enter the region of your billing profile'),
            prompt: vscode.l10n.t('Region'),
            ignoreFocusOut: true,
            validateInput: (value: string) => {
                if (!value) {
                    return vscode.l10n.t('Region is required');
                }
                return undefined;
            }
        });
        if (!region) {
            return;
        }

        const app = await GetOrCreateApp.run(AppType.OwningApp);
        if (!app) {
            return;
        }

        //TODO: improve? allow AppId to propogate if new app
        const appProgressWindow = new ProgressWaitNotification(vscode.l10n.t('Configuring owning Entra app...'));
        appProgressWindow.show();
        const appTimer = new Timer(30 * 1000);
        while (!appTimer.finished) { };
        appProgressWindow.hide();

        const ctCreationProgressWindow = new ProgressWaitNotification(vscode.l10n.t('Creating container type...'));
        ctCreationProgressWindow.show();
        const ctTimer = new Timer(30 * 1000);
        const containerTypeProvider = account.containerTypeProvider;
        let containerType: ContainerType | undefined;
        do {
            try {
                containerType = await containerTypeProvider.createPaid(displayName, azureSubscriptionId, resourceGroup, region, app.clientId);
                if (!containerType) {
                    throw new Error();
                }
            } catch (error) { }
        } while (!containerType && !ctTimer.finished);

        if (!containerType) {
            vscode.window.showErrorMessage(vscode.l10n.t('Failed to create container type'));
            ctCreationProgressWindow.hide();
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
        ctCreationProgressWindow.hide();

        // Register Syntex Provider
        const armProvider = account.armProvider;
        const billingProgressWindow = new ProgressWaitNotification(vscode.l10n.t('Setting up your billing profile. Please be patient, this may take up to five minutes.'));
        billingProgressWindow.show();
        const syntexRegistrationTimer = new Timer(60 * 5 * 1000);   
        try {
            const syntexProviderDetails = await armProvider.createSyntexProvider(azureSubscriptionId, {});
            if (!syntexProviderDetails) {
                throw new Error(vscode.l10n.t('Failed to create Syntex provider. Please try creating a container type again.'));
            }
            let registrationComplete = false;
            const refreshRegistrationStatus = async (): Promise<void> => {
                do {
                    const syntexProviderDetails = await armProvider.getSyntexProvider(azureSubscriptionId);
                    if (syntexProviderDetails.registrationState === 'Registered') {
                        registrationComplete = true;
                        break;
                    }
                    // sleep for 30 seconds
                    await new Promise(r => setTimeout(r, 30 * 1000));
                }
                while (!syntexRegistrationTimer.finished);
            };
            await refreshRegistrationStatus();
            if (!registrationComplete) {
                throw new Error(vscode.l10n.t('Failed registering Syntex provider. Please try creating a container type again, as the registration may have not propogated.'));
            }
        } catch (error: any) {
            billingProgressWindow.hide();
            vscode.window.showErrorMessage(error.messsage);
            await DeleteContainerType.run(containerType);
            return;
        }

        try {
            const armAccountDetails = await armProvider.createArmAccount(azureSubscriptionId, resourceGroup, region, containerType.id);
            if (armAccountDetails.properties.provisioningState !== 'Succeeded') {
                throw new Error(vscode.l10n.t('Failed to create a billing profile. Please try creating a container type again.'));
            }
        } catch (error: any) {
            billingProgressWindow.hide();
            vscode.window.showErrorMessage(error.messsage);
            await DeleteContainerType.run(containerType);
            return;
        }

        billingProgressWindow.hide();
        const register = vscode.l10n.t('Register on local tenant');
        const buttons = [register];
        const selection = await vscode.window.showInformationMessage(
            vscode.l10n.t(`Your container type has been created. Would you like to register it on your local tenant?`),
            ...buttons
        );
        if (selection === register) {
            RegisterOnLocalTenant.run(containerType);
        }
        return containerType;
    }
}


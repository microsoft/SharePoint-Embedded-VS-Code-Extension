/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import { ContainerType } from '../../models/schemas';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { AuthenticationState } from '../../services/AuthenticationState';
import { GraphProvider } from '../../services/Graph';
import { AppAuthProviderFactory } from '../../services/Auth';
import { CreateAppCert } from '../App/Credentials/CreateAppCert';
import { GetLocalAdminConsent } from '../App/GetLocalAdminConsent';
import { ProgressWaitNotification, Timer } from '../../views/notifications/ProgressWaitNotification';

// Static class that handles the register container type command
export class RegisterOnLocalTenant extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.registerOnLocalTenant';

    // Command handler
    public static async run(commandProps?: RegistrationCommandProps, newApplicationPermissions?: any): Promise<void> {
        if (!commandProps) {
            return;
        }

        // Check if user is signed in with main authentication
        if (!AuthenticationState.isSignedIn()) {
            vscode.window.showErrorMessage('Please sign in to register container types.');
            return;
        }

        const currentAccount = await AuthenticationState.getCurrentAccount();
        if (!currentAccount) {
            vscode.window.showErrorMessage('Failed to get account information.');
            return;
        }

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

        // Get the owning application
        const owningApp = await graphProvider.applications.get(containerType.owningAppId);
        if (!owningApp || !owningApp.appId) {
            vscode.window.showErrorMessage('Failed to get owning application information.');
            return;
        }

        // Create app-specific authentication provider for container operations
        // This uses the owning app's client ID with the same account that signed in
        const appAuthProvider = AppAuthProviderFactory.getProvider(owningApp.appId, currentAccount.tenantId);
        
        // TODO: Implement certificate credential check
        // For now, show a warning that this functionality is being migrated
        const continueRegistration = vscode.l10n.t('Continue anyway');
        const buttons = [continueRegistration];
        const choice = await vscode.window.showWarningMessage(
            vscode.l10n.t('Container type registration is being migrated to the new authentication system. Some features may not work as expected. Continue anyway?'),
            ...buttons
        );
        if (choice !== continueRegistration) {
            return;
        }

        // Try to get an authentication session for the owning app using the current account
        try {
            // Use the current account information to ensure we authenticate with the same user
            const accountInfo: vscode.AuthenticationSessionAccountInformation = {
                id: currentAccount.id,
                label: currentAccount.username
            };
            
            await appAuthProvider.getToken(['https://graph.microsoft.com/FileStorageContainer.Selected'], true, accountInfo);
        } catch (error: any) {
            vscode.window.showErrorMessage(vscode.l10n.t('Failed to authenticate with owning app: {0}', error.message));
            return;
        }

        const registrationProgress = new ProgressWaitNotification(vscode.l10n.t('Registering container type on local tenant...'));
        registrationProgress.show();
        
        try {
            // TODO: Implement actual container type registration via GraphProvider
            // This would involve:
            // 1. Checking if the app has required permissions
            // 2. Creating service principal if needed
            // 3. Registering the container type in SharePoint Admin
            
            // For now, show a placeholder message
            await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate work
            
            registrationProgress.hide();
            const message = vscode.l10n.t('Container type registration is not yet fully implemented in the new authentication system. This will be available in a future update.');
            vscode.window.showWarningMessage(message);
            
            // Refresh the tree view anyway in case something changed
            DevelopmentTreeViewProvider.instance.refresh();
            
        } catch (error: any) {
            registrationProgress.hide();
            const message = vscode.l10n.t('Failed to register Container Type {0} on local tenant: {1}', containerType.name, error.message);
            vscode.window.showErrorMessage(message);
            return;
        }
    }
}

export type RegistrationCommandProps = ContainerTypeTreeItem | ContainerType;

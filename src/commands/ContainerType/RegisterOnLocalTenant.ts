/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import { ContainerType } from '../../models/ContainerType';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { GetAccount } from '../Accounts/GetAccount';
import { CreateAppCert } from '../App/Credentials/CreateAppCert';
import { GetLocalAdminConsent } from '../App/GetLocalAdminConsent';
import { ProgressWaitNotification, Timer } from '../../views/notifications/ProgressWaitNotification';
import { ApplicationPermissions } from '../../models/ApplicationPermissions';

// Static class that handles the register container type command
export class RegisterOnLocalTenant extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.registerOnLocalTenant';

    // Command handler
    public static async run(commandProps?: RegistrationCommandProps, newApplicationPermissions?: ApplicationPermissions): Promise<void> {
        if (!commandProps) {
            return;
        }

        const account = await GetAccount.run();
        if (!account) {
            return;
        }

        let containerType: ContainerType;
        if (commandProps instanceof ContainerTypeTreeItem) {
            containerType = commandProps.containerType;
        } else {
            containerType = commandProps;
        }
        if (!containerType) {
            return;
        }

        const owningApp = await containerType.loadOwningApp();
        if (!owningApp) {
            return;
        }

        let hasCert = await owningApp.hasCert();
        if (!hasCert) {
            const createCert = 'Create certificate credential';
            const buttons = [createCert];
            const choice = await vscode.window.showInformationMessage(
                'The owning app does not have a certificate credential. You need one to register a container type. Do you want to create one now?',
                ...buttons
            );
            if (choice !== createCert) {
                return;
            }
            await CreateAppCert.run(owningApp);
        }
        hasCert = await owningApp.hasCert();
        if (!hasCert) {
            return;
        }

        const adminConsentCheck = new ProgressWaitNotification('Checking for admin consent on your owning app...');
        adminConsentCheck.show();
        const localRegistrationScope = containerType.localRegistrationScope;
        const owningAppProvider = account.appProvider;
        const appAuthProvider = await owningApp.getAppOnlyAuthProvider(account.tenantId);
        let consented = await appAuthProvider.hasConsent(localRegistrationScope, ['Container.Selected']);
        adminConsentCheck.hide();
        if (!consented) {
            let hasRequiredRole = owningApp.checkRequiredResourceAccess(owningAppProvider.SharePointResourceAppId, owningAppProvider.ContainerSelectedRole.id);
            if (!hasRequiredRole) {
                const addRequiredRole = `Add SharePoint Container.Selected role`;
                const buttons = [addRequiredRole];
                const choice = await vscode.window.showInformationMessage(
                    `Your owning app '${owningApp.displayName}' requires SharePoint Container.Selected API permission role. Add it now?`,
                    ...buttons
                );
                if (choice !== addRequiredRole) {
                    return;
                }

                try {
                    await owningAppProvider.addResourceAccess(owningApp!, [{
                        resourceAppId: owningAppProvider.SharePointResourceAppId,
                        resourceAccess: [
                            owningAppProvider.ContainerSelectedRole
                        ]
                    }]);
                    hasRequiredRole = owningApp.checkRequiredResourceAccess(owningAppProvider.SharePointResourceAppId, owningAppProvider.ContainerSelectedRole.id);
                    if (!hasRequiredRole) {
                        throw new Error();
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to add Container.Selected role for '${owningApp.displayName}'`);
                    return;
                }
            }

            const openConsent = `Open consent link`;
            const buttons = [openConsent];
            const choice = await vscode.window.showInformationMessage(
                `Your owning app '${owningApp.displayName}' requires admin consent on your local tenant. Grant consent now?`,
                ...buttons
            );
            if (choice !== openConsent) {
                return;
            }

            consented = await GetLocalAdminConsent.run(owningApp);
            if (!consented) {
                vscode.window.showErrorMessage(`Failed to get required Container.Selected permission on '${owningApp.displayName}' to register container type`);
                return;
            }

            const consentPropagationProgress = new ProgressWaitNotification('Waiting for consent to propagate in Azure (may take a minute)...');
            consentPropagationProgress.show();
            const consentPropagationTimer = new Timer(60 * 1000);
            let sharePointConsent = await appAuthProvider.hasConsent(localRegistrationScope, ['Container.Selected']);
            while (!sharePointConsent && !consentPropagationTimer.finished) {
                await new Promise(r => setTimeout(r, 3000));
                sharePointConsent = await appAuthProvider.hasConsent(localRegistrationScope, ['Container.Selected']);
            }
            consentPropagationProgress.hide();
        }

        const registrationProgress = new ProgressWaitNotification('Registering container type on local tenant (may take a minute)...');
        registrationProgress.show();
        const registrationTimer = new Timer(60 * 1000);
        let registered = false;
        while (!registered && !registrationTimer.finished) {
            try {
                await containerType.registerOnLocalTenant(newApplicationPermissions);
                registered = true;
            } catch (error: any) {
                console.log(`Unable to register Container Type '${containerType.displayName}': ${error}`);
                await new Promise(r => setTimeout(r, 5000));
            }
        }
        registrationProgress.hide();
        if (!registered) {
            vscode.window.showErrorMessage(`Failed to register Container Type '${containerType.displayName}' on local tenant`);
            return;
        }
        vscode.window.showInformationMessage(`Successfully registered Container Type '${containerType.displayName}' on local tenant`);       
        DevelopmentTreeViewProvider.instance.refresh();
    }
}

export type RegistrationCommandProps = ContainerTypeTreeItem | ContainerType;



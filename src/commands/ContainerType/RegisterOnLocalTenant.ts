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
        console.log('RegisterOnLocalTenant.run', commandProps);
        const account = await GetAccount.run();
        if (!account) {
            return;
        }

        let containerType: ContainerType | undefined;
        if (commandProps instanceof ContainerTypeTreeItem) {
            containerType = commandProps.containerType;
        } else if (commandProps instanceof ContainerType) {
            containerType = commandProps;
        }

        if (!containerType) {
            console.log("No container type found in commandProps");
            // No arguments passed -- let the user choose from their existing container types
            try {
                const containerTypeProvider = account.containerTypeProvider;
                const containerTypes = await containerTypeProvider.list();
                console.log(containerTypes);
                if (!containerTypes || containerTypes.length === 0) {
                    vscode.window.showErrorMessage('No container types found');
                    return;
                }
                class ContainerTypeQuickPickItem implements vscode.QuickPickItem {
                    label: string;
                    description: string;
                    containerType: ContainerType;
                    constructor(containerType: ContainerType) {
                        this.label = containerType.displayName;
                        this.description = containerType.isTrial ? 'Trial' : 'Paid';
                        this.containerType = containerType;
                    }
                }
                const options: ContainerTypeQuickPickItem[] = containerTypes.map((ct) => {
                    return new ContainerTypeQuickPickItem(ct);
                });
                const selected = await vscode.window.showQuickPick(options, {
                    placeHolder: 'Select a container type to register on your local tenant'
                });
                if (!selected) {
                    return;
                }
                containerType = selected.containerType;
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to fetch container types: ${error.message}`);
                return;
            }
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
            const createCert = vscode.l10n.t('Create certificate credential');
            const buttons = [createCert];
            const choice = await vscode.window.showInformationMessage(
                vscode.l10n.t('The owning app does not have a certificate credential. You need one to register a container type. Do you want to create one now?'),
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

        const adminConsentCheck = new ProgressWaitNotification(vscode.l10n.t('Checking for admin consent on your owning app...'));
        adminConsentCheck.show();
        const localRegistrationScope = containerType.localRegistrationScope;
        const owningAppProvider = account.appProvider;
        const appAuthProvider = await owningApp.getAppOnlyAuthProvider(account.tenantId);
        let consented = await appAuthProvider.hasConsent(localRegistrationScope, ['Container.Selected']);
        adminConsentCheck.hide();
        if (!consented) {
            const configureAppProgress = new ProgressWaitNotification(vscode.l10n.t('Configuring Entra app...'));
            configureAppProgress.show();
            let hasRequiredRole = await owningApp.checkRequiredResourceAccess(owningAppProvider.SharePointResourceAppId, owningAppProvider.ContainerSelectedRole.id, false);
            if (!hasRequiredRole) {
                const addRequiredRole = `Add SharePoint Container.Selected role`;
                const buttons = [addRequiredRole];
                const message = vscode.l10n.t('Your owning app {0} requires SharePoint Container.Selected API permission role. Add it now?', owningApp.displayName);
                const choice = await vscode.window.showInformationMessage(
                    message,
                    ...buttons
                );
                if (choice !== addRequiredRole) {
                    configureAppProgress.hide();
                    return;
                }

                try {
                    await owningAppProvider.addResourceAccess(owningApp!, {
                        resourceAppId: owningAppProvider.SharePointResourceAppId,
                        resourceAccess: [
                            owningAppProvider.ContainerSelectedRole
                        ]
                    });
                    hasRequiredRole = await owningApp.checkRequiredResourceAccess(owningAppProvider.SharePointResourceAppId, owningAppProvider.ContainerSelectedRole.id, false);
                    if (!hasRequiredRole) {
                        throw new Error();
                    } 
                } catch (error: any) {
                    const message = vscode.l10n.t('Failed to add SharePoint Container.Selected role for {0}', owningApp.displayName);
                    vscode.window.showErrorMessage(message);
                    configureAppProgress.hide();
                    return;
                }
            }
            // Check if consent URI has been added to app, if not, add it
            const requiredUris = [
                owningAppProvider.WebRedirectUris.consentRedirectUri
            ];

            const consentUriAdded = await owningAppProvider.ensureConsentRedirectUri(owningApp, requiredUris);
            if (!consentUriAdded) {
                configureAppProgress.hide();            
                return;           
            }

            configureAppProgress.hide();
        
            const openConsent = vscode.l10n.t(`Open consent link`);
            const buttons = [openConsent];
            const message = vscode.l10n.t('Your owning app {0} requires admin consent on your local tenant. Grant consent now?', owningApp.displayName);
            const choice = await vscode.window.showInformationMessage(
                message,
                ...buttons
            );
            if (choice !== openConsent) {
                return;
            }

            consented = await GetLocalAdminConsent.run(owningApp);
            if (!consented) {
                const message = vscode.l10n.t('Failed to get required Container.Selected permission on {0} to register container type', owningApp.displayName);
                vscode.window.showErrorMessage(message);
                return;
            }

            const consentPropagationProgress = new ProgressWaitNotification(vscode.l10n.t('Waiting for consent to propagate in Azure (may take a minute)...'));
            consentPropagationProgress.show();
            const consentPropagationTimer = new Timer(60 * 1000);
            let sharePointConsent = await appAuthProvider.hasConsent(localRegistrationScope, ['Container.Selected']);
            while (!sharePointConsent && !consentPropagationTimer.finished) {
                await new Promise(r => setTimeout(r, 3000));
                sharePointConsent = await appAuthProvider.hasConsent(localRegistrationScope, ['Container.Selected']);
            }
            consentPropagationProgress.hide();
        }

        const registrationProgress = new ProgressWaitNotification(vscode.l10n.t('Registering container type on local tenant (may take a minute)...'));
        registrationProgress.show();
        const registrationTimer = new Timer(60 * 1000);
        let registered = false;
        while (!registered && !registrationTimer.finished) {
            try {
                await containerType.registerOnLocalTenant(newApplicationPermissions);
                registered = true;
            } catch (error: any) {
                await new Promise(r => setTimeout(r, 5000));
            }
        }
        registrationProgress.hide();
        if (!registered) {
            const message = vscode.l10n.t('Failed to register Container Type {0} on local tenant', containerType.displayName);
            vscode.window.showErrorMessage(message);
            return;
        }
        const message = vscode.l10n.t('Successfully registered Container Type {0} on local tenant', containerType.displayName);
        vscode.window.showInformationMessage(message);
        DevelopmentTreeViewProvider.instance.refresh();
    }
}

export type RegistrationCommandProps = ContainerTypeTreeItem | ContainerType;



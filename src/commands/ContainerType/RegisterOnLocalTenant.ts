        /*

        0. Create SpProvider that uses cert auth and has registerContainerType method
        0. Check for app cert -- call CreateAppCert command if needed
        0. Implement CreateAppCert
        0. Check for app consent? call GetAppConsent command if needed
        0. Implement GetAppConsent
        0. Implement RegisterContainerType

        */
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

// Static class that handles the register container type command
export class RegisterOnLocalTenant extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.registerOnLocalTenant';

    // Command handler
    public static async run(commandProps?: RegistrationCommandProps): Promise<void> {
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
        const appAuthProvider = await owningApp.getAppOnlyAuthProvider(account.tenantId);
        let consented = await appAuthProvider.hasConsent(localRegistrationScope, ['Container.Selected']);
        adminConsentCheck.hide();
        if (!consented) {
            const grantConsent = `Grant admin consent`;
            const buttons = [grantConsent];
            const choice = await vscode.window.showInformationMessage(
                `The owning app '${owningApp.displayName}' does not have admin consent on the local tenant. You need to grant consent to the app before you can register the container type. Do you want to grant consent now?`,
                ...buttons
            );
            if (choice !== grantConsent) {
                return;
            }
            consented = await GetLocalAdminConsent.run(owningApp);
            if (!consented) {
                vscode.window.showErrorMessage(`Failed to get required Container.Selected permission on '${owningApp.displayName}' to register container type`);
                return;
            }
        }

        const registrationProgress = new ProgressWaitNotification('Registering container type on local tenant (may take a minute)...');
        registrationProgress.show();
        const registrationTimer = new Timer(60 * 1000);
        let registered = false;
        while (!registered && !registrationTimer.finished) {
            try {
                await containerType.registerOnLocalTenant();
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
        DevelopmentTreeViewProvider.instance.refresh();
    }
}

export type RegistrationCommandProps = ContainerTypeTreeItem | ContainerType;



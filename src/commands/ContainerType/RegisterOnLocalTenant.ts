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
import { Account } from '../../models/Account';
import { ContainerType } from '../../models/ContainerType';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { GetAccount } from '../Accounts/GetAccount';
import { CreateAppCert } from '../App/CreateAppCert';
import { has } from 'lodash';
import { ProgressNotification } from '../../views/notifications/ProgressNotification';
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

        console.log('going to register CT, checking for cert');
        let hasCert = await owningApp.hasCert();
        console.log(`has cert: ${hasCert}`);
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
            CreateAppCert.run(owningApp);
        }
        hasCert = await owningApp.hasCert();
        if (!hasCert) {
            return;
        }
        const localRegistrationScope = containerType.localRegistrationScope;
        const appAuthProvider = await owningApp.getAppOnlyAuthProvider(account.tenantId);
        let consented = await appAuthProvider.hasConsent(localRegistrationScope, ['Container.Selected']);
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
            const consentProgress = new ProgressWaitNotification('Waiting for admin consent');
            consentProgress.show();
            const adminConsent = await appAuthProvider.listenForAdminConsent(owningApp.clientId, account.tenantId);
            consentProgress.hide();
            if (!adminConsent) {
                vscode.window.showErrorMessage(`Failed to get admin consent for app '${owningApp.displayName}'`);
                return;
            }

            const consentPropagationProgress = new ProgressWaitNotification('Waiting for consent to propagate');
            consentPropagationProgress.show();
            const consentPropagationTimer = new Timer(30 * 1000);
            do {
                consented = await appAuthProvider.hasConsent(localRegistrationScope, ['Container.Selected']);
            } while (!consented && !consentPropagationTimer.finished);
            consentPropagationProgress.hide();
        }

        try {
            const registrationProgress = new ProgressWaitNotification('Registering container type on local tenant');
            registrationProgress.show();
            await containerType.registerOnLocalTenant();
            registrationProgress.hide();
            DevelopmentTreeViewProvider.getInstance().refresh();
        } catch (error: any) {
            vscode.window.showErrorMessage(`Unable to register Container Type ${containerType.displayName}: ${error}`);
            return;
        }
    }
}

export type RegistrationCommandProps = ContainerTypeTreeItem | ContainerType;



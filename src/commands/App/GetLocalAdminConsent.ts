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
import { GetAccount } from '../Accounts/GetAccount';
import { ProgressWaitNotification, Timer } from '../../views/notifications/ProgressWaitNotification';
import { AppTreeItem } from '../../views/treeview/development/AppTreeItem';
import { App } from '../../models/App';

// Static class that handles the register container type command
export class GetLocalAdminConsent extends Command {
    // Command name
    public static readonly COMMAND = 'App.Permissions.LocalAdminConsent.openLink';

    // Command handler
    public static async run(commandProps?: AdminConsentCommandProps): Promise<boolean> {
        if (!commandProps) {
            return false;
        }

        const account = await GetAccount.run();
        if (!account) {
            return false;
        }

        let app: App | undefined;
        if (commandProps instanceof AppTreeItem) {
            if (commandProps.app && commandProps.app instanceof App) {
                app = commandProps.app;
            }
        } else {
            app = commandProps;
        }
        if (!app) {
            return false;
        }

        const consentProgress = new ProgressWaitNotification('Waiting for admin consent...', true);
        consentProgress.show();
        const localRegistrationScope = `${account.spRootSiteUrl}/.default`;
        const graphRegistrationScope = 'https://graph.microsoft.com/.default';
        try {
            const appAuthProvider = await app.getAppOnlyAuthProvider(account.tenantId);
            const adminConsent = await appAuthProvider.listenForAdminConsent(app.clientId, account.tenantId);
            consentProgress.hide();
            if (!adminConsent) {
                vscode.window.showErrorMessage(`Failed to get admin consent for app '${app.displayName}'`);
                return false;
            }

            const consentPropagationProgress = new ProgressWaitNotification('Waiting for consent to propagate in Azure (could take up to a minute)...');
            consentPropagationProgress.show();
            const consentPropagationTimer = new Timer(60 * 1000);
            let sharePointConsent = await appAuthProvider.hasConsent(localRegistrationScope, ['Container.Selected']);
            let graphConsent = await appAuthProvider.hasConsent(graphRegistrationScope, ['FileStorageContainer.Selected']);
            while (!graphConsent && sharePointConsent && !consentPropagationTimer.finished) {
                await new Promise(r => setTimeout(r, 3000));
                sharePointConsent = await appAuthProvider.hasConsent(localRegistrationScope, ['Container.Selected']);
                graphConsent = await appAuthProvider.hasConsent(graphRegistrationScope, ['FileStorageContainer.Selected']);
            }
            consentPropagationProgress.hide();
            return sharePointConsent && graphConsent;
        } catch (error: any) {
            consentProgress.hide();
            vscode.window.showErrorMessage(`Failed to get admin consent for app '${app.displayName}': ${error}`);
            return false;
        }
    }
}

export type AdminConsentCommandProps = AppTreeItem | App;



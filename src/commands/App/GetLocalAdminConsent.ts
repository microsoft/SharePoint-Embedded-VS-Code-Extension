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
import { BaseAuthProvider } from '../../services/BaseAuthProvider';

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

        const consentProgress = new ProgressWaitNotification(vscode.l10n.t('Waiting for admin consent...'), true);
        consentProgress.show();
        try {
            const adminConsent = await BaseAuthProvider.listenForAdminConsent(app.clientId, account.tenantId);
            consentProgress.hide();
            return adminConsent;
        } catch (error: any) {
            consentProgress.hide();
            const message = vscode.l10n.t('Failed to get admin consent for app {0}: {1}', app.displayName, error);
            vscode.window.showErrorMessage(message);
            return false;
        }
    }
}

export type AdminConsentCommandProps = AppTreeItem | App;



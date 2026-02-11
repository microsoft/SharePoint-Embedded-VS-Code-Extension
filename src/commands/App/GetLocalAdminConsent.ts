/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import { AuthenticationState } from '../../services/AuthenticationState';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { ProgressWaitNotification, Timer } from '../../views/notifications/ProgressWaitNotification';
import { AppTreeItem } from '../../views/treeview/development/AppTreeItem';
import { GuestApplicationTreeItem } from '../../views/treeview/development/GuestAppTreeItem';
import { OwningAppTreeItem } from '../../views/treeview/development/OwningAppTreeItem';
import { Application } from '../../models/schemas';
import { AdminConsentHelper } from '../../utils/AdminConsentHelper';

// Static class that handles the register container type command
export class GetLocalAdminConsent extends Command {
    // Command name
    public static readonly COMMAND = 'App.Permissions.LocalAdminConsent.openLink';

    // Command handler
    public static async run(commandProps?: AdminConsentCommandProps): Promise<boolean> {
        if (!commandProps) {
            return false;
        }

        if (!AuthenticationState.isSignedIn()) {
            vscode.window.showErrorMessage('Please sign in to get admin consent.');
            return false;
        }

        const graphProvider = GraphProvider.getInstance();

        let app: Application | null | undefined;
        if (commandProps instanceof GuestApplicationTreeItem) {
            // Guest app - get appId from legacy app and fetch fresh Application
            const legacyApp = commandProps.appPerms?.app;
            if (legacyApp?.clientId) {
                app = await graphProvider.applications.get(legacyApp.clientId, { useAppId: true });
            }
        } else if (commandProps instanceof OwningAppTreeItem) {
            // Owning app - get from container type
            const appId = commandProps.containerType.owningAppId;
            app = await graphProvider.applications.get(appId, { useAppId: true });
        } else if ('appId' in commandProps) {
            // Already an Application schema
            app = commandProps;
        }

        if (!app) {
            vscode.window.showErrorMessage('No application found for admin consent.');
            return false;
        }

        const consentProgress = new ProgressWaitNotification(vscode.l10n.t('Waiting for admin consent...'), true);
        consentProgress.show();
        try {
            const account = await AuthenticationState.getCurrentAccount();
            if (!account || !app.appId) {
                throw new Error('Missing account or app information');
            }
            const adminConsent = await AdminConsentHelper.listenForAdminConsent(app.appId, account.tenantId);
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

export type AdminConsentCommandProps = AppTreeItem | Application;



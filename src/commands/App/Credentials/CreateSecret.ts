/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../../Command';
import { Application } from '../../../models/schemas';
import { DevelopmentTreeViewProvider } from '../../../views/treeview/development/DevelopmentTreeViewProvider';
import { AuthenticationState } from '../../../services/AuthenticationState';
import { GraphProvider } from '../../../services/Graph';
import { AppTreeItem } from '../../../views/treeview/development/AppTreeItem';
import { ProgressWaitNotification } from '../../../views/notifications/ProgressWaitNotification';
import { GuestApplicationTreeItem } from '../../../views/treeview/development/GuestAppTreeItem';
import { OwningAppTreeItem } from '../../../views/treeview/development/OwningAppTreeItem';

// Static class that creates a secret on an app
export class CreateSecret extends Command {
    // Command name
    public static readonly COMMAND = 'App.Credentials.createSecret';

    // Command handler
    public static async run(commandProps?: CreateSecretProps): Promise<Application | undefined> {
        if (!AuthenticationState.isSignedIn()) {
            vscode.window.showErrorMessage('Please sign in to create app secrets.');
            return;
        }

        const graphProvider = GraphProvider.getInstance();
        
        let app: Application | undefined;
        if (commandProps instanceof AppTreeItem) {
            if (commandProps instanceof GuestApplicationTreeItem) {
                // Need to get app by ID from owningAppId
                const appId = commandProps.appPerms.appId;
                app = (await graphProvider.applications.get(appId)) || undefined;
            }
            if (commandProps instanceof OwningAppTreeItem) {
                // Get app by owningAppId
                const appId = commandProps.containerType.owningAppId;
                app = (await graphProvider.applications.get(appId)) || undefined;
            }
        } else {
            app = commandProps;
        }
        if (!app) {
            return;
        }
        
        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Creating app secret...'));
        progressWindow.show();
        try {
            // TODO: Implement secret creation in GraphProvider
            // await graphProvider.applications.addSecret(app.id!);
            progressWindow.hide();
            const message = vscode.l10n.t('Secret creation is not yet implemented in the new authentication system.');
            vscode.window.showWarningMessage(message);
            DevelopmentTreeViewProvider.instance.refresh();
            return app;
        } catch (error: any) {
            progressWindow.hide();
            const message = vscode.l10n.t('Failed to create secret for app {0}: {1}', app.displayName, error);
            vscode.window.showErrorMessage(message);
            return;
        }
    };
}

export type CreateSecretProps = AppTreeItem | Application;

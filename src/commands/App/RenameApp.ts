/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { Command } from '../Command';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';
import { App } from '../../models/App';
import { AppTreeItem } from '../../views/treeview/development/AppTreeItem';
import { GuestApplicationTreeItem } from '../../views/treeview/development/GuestAppTreeItem';
import { OwningAppTreeItem } from '../../views/treeview/development/OwningAppTreeItem';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { Application } from '../../models/schemas';

// Static class that handles the rename application command
export class RenameApp extends Command {
    // Command name
    public static readonly COMMAND = 'App.rename';

    // Command handler
    public static async run(commandProps?: RenameAppProps): Promise<void> {
        if (!commandProps) {
            return;
        }

        const graphProvider = GraphProvider.getInstance();

        // Extract app info from command props
        let appId: string | undefined;
        let objectId: string | undefined;
        let currentName: string | undefined;

        if (commandProps instanceof OwningAppTreeItem) {
            appId = commandProps.containerType.owningAppId;
            // Fetch the full application to get object ID and current name
            const app = await graphProvider.applications.get(appId, { useAppId: true });
            if (app) {
                objectId = app.id;
                currentName = app.displayName;
            }
        } else if (commandProps instanceof GuestApplicationTreeItem) {
            // Guest app - get from appPerms
            const legacyApp = commandProps.appPerms?.app;
            if (legacyApp) {
                objectId = legacyApp.objectId;
                currentName = legacyApp.displayName;
            }
        } else if ('objectId' in commandProps) {
            // Legacy App model
            objectId = (commandProps as App).objectId;
            currentName = (commandProps as App).displayName;
        } else if ('id' in commandProps) {
            // New Application schema
            objectId = (commandProps as Application).id;
            currentName = (commandProps as Application).displayName;
        }

        if (!objectId) {
            vscode.window.showErrorMessage(vscode.l10n.t('Could not find application'));
            return;
        }

        const newDisplayName = await vscode.window.showInputBox({
            title: vscode.l10n.t('New display name:'),
            value: currentName,
            prompt: vscode.l10n.t('Enter the new display name for the app:'),
            validateInput: (value: string): string | undefined => {
                const maxLength = 120;
                if (!value || value.trim().length === 0) {
                    return vscode.l10n.t('Display name cannot be empty');
                }
                if (value.length > maxLength) {
                    return vscode.l10n.t('Display name must be no more than {0} characters long', maxLength);
                }
                // Azure AD allows more characters than container types
                const invalidChars = /[<>;&%]/;
                if (invalidChars.test(value)) {
                    return vscode.l10n.t('Display name cannot contain < > ; & %');
                }
                if (value === currentName) {
                    return vscode.l10n.t('Please enter a different name');
                }
                return undefined;
            }
        });

        if (!newDisplayName) {
            return; // User cancelled
        }

        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Renaming application...'));
        progressWindow.show();

        try {
            await graphProvider.applications.update(objectId, {
                displayName: newDisplayName.trim()
            });

            progressWindow.hide();
            vscode.window.showInformationMessage(
                vscode.l10n.t('Application renamed to "{0}".', newDisplayName.trim())
            );

            // Refresh the tree view
            DevelopmentTreeViewProvider.getInstance().refresh();
        } catch (error: any) {
            progressWindow.hide();
            console.error('[RenameApp] Error renaming application:', error);

            let errorMessage = vscode.l10n.t('Failed to rename application');
            if (error.message) {
                errorMessage += `: ${error.message}`;
            }

            vscode.window.showErrorMessage(errorMessage);
        }
    }
}

export type RenameAppProps = AppTreeItem | App | Application;
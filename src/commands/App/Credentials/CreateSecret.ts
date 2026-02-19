/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../../Command';
import { DevelopmentTreeViewProvider } from '../../../views/treeview/development/DevelopmentTreeViewProvider';
import { AppTreeItem } from '../../../views/treeview/development/AppTreeItem';
import { ProgressWaitNotification } from '../../../views/notifications/ProgressWaitNotification';
import { GuestApplicationTreeItem } from '../../../views/treeview/development/GuestAppTreeItem';
import { OwningAppTreeItem } from '../../../views/treeview/development/OwningAppTreeItem';
import { GraphProvider } from '../../../services/Graph/GraphProvider';
import { Application, PasswordCredential } from '../../../models/schemas';

/**
 * Result of creating a secret - includes the secret text which is only available at creation time
 */
export interface CreateSecretResult {
    appId: string;
    displayName: string;
    credential: PasswordCredential;
    secretText: string;
}

// Static class that creates a secret on an app
export class CreateSecret extends Command {
    // Command name
    public static readonly COMMAND = 'App.Credentials.createSecret';

    /**
     * Create a new client secret for an application.
     * Returns the secret text directly - it is NOT stored locally.
     * The secret text is only available at creation time from the Graph API response.
     */
    public static async run(commandProps?: CreateSecretProps): Promise<CreateSecretResult | undefined> {
        if (!commandProps) {
            return;
        }

        const graphProvider = GraphProvider.getInstance();

        // Extract app info from command props
        let appId: string | undefined;
        let objectId: string | undefined;
        let displayName: string | undefined;

        if (commandProps instanceof OwningAppTreeItem) {
            appId = commandProps.containerType.owningAppId;
            const app = await graphProvider.applications.get(appId, { useAppId: true });
            if (app) {
                objectId = app.id;
                displayName = app.displayName;
            }
        } else if (commandProps instanceof GuestApplicationTreeItem) {
            const app = commandProps.application;
            if (app) {
                objectId = app.id;
                appId = app.appId;
                displayName = app.displayName;
            }
        } else if ('id' in commandProps && 'displayName' in commandProps) {
            objectId = (commandProps as Application).id;
            appId = (commandProps as Application).appId ?? undefined;
            displayName = (commandProps as Application).displayName;
        }

        if (!objectId || !appId) {
            vscode.window.showErrorMessage(vscode.l10n.t('Could not find application'));
            return;
        }

        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Creating app secret...'));
        progressWindow.show();

        try {
            // Create the secret using ApplicationService
            const credential = await graphProvider.applications.addPassword(objectId, {
                displayName: 'SPE Extension Secret'
            });

            progressWindow.hide();

            // The secretText is only available in the response at creation time
            const secretText = credential.secretText;
            if (!secretText) {
                throw new Error('Secret was created but secretText was not returned');
            }

            vscode.window.showInformationMessage(
                vscode.l10n.t('Secret created for app "{0}". Note: This secret is not stored locally.', displayName || appId)
            );

            DevelopmentTreeViewProvider.getInstance().refresh();

            return {
                appId,
                displayName: displayName || appId,
                credential,
                secretText
            };
        } catch (error: any) {
            progressWindow.hide();
            console.error('[CreateSecret] Error creating secret:', error);

            let errorMessage = vscode.l10n.t('Failed to create secret');
            if (error.message) {
                errorMessage += `: ${error.message}`;
            }

            vscode.window.showErrorMessage(errorMessage);
            return;
        }
    }
}

export type CreateSecretProps = AppTreeItem | Application;

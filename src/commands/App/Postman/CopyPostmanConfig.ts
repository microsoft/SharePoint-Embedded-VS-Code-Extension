/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../../Command';
import { GuestApplicationTreeItem } from '../../../views/treeview/development/GuestAppTreeItem';
import { OwningAppTreeItem } from '../../../views/treeview/development/OwningAppTreeItem';
import { ContainerType } from '../../../models/schemas';
import { AppTreeItem } from '../../../views/treeview/development/AppTreeItem';
import { CreatePostmanConfig, CreatePostmanConfigParams } from './CreatePostmanConfig';
import { GraphProvider } from '../../../services/Graph/GraphProvider';

// Static class that handles the Postman copy command
export class CopyPostmanConfig extends Command {
    // Command name
    public static readonly COMMAND = 'App.Postman.copyEnvironmentFile';

    // Command handler
    public static async run(applicationTreeItem?: AppTreeItem): Promise<void> {
        if (!applicationTreeItem) {
            return;
        }

        const graphProvider = GraphProvider.getInstance();

        let appId: string | undefined;
        let objectId: string | undefined;
        let displayName: string | undefined;
        let containerType: ContainerType | undefined;

        if (applicationTreeItem instanceof GuestApplicationTreeItem) {
            const app = applicationTreeItem.application;
            if (app) {
                appId = app.appId;
                objectId = app.id;
                displayName = app.displayName;
            }
            const ct = await graphProvider.containerTypes.get(applicationTreeItem.containerTypeId);
            if (ct) {
                containerType = ct;
            }
        } else if (applicationTreeItem instanceof OwningAppTreeItem) {
            appId = applicationTreeItem.containerType.owningAppId;
            containerType = applicationTreeItem.containerType;
            const app = await graphProvider.applications.get(appId, { useAppId: true });
            if (app) {
                objectId = app.id;
                displayName = app.displayName;
            }
        }

        if (!appId || !objectId || !containerType) {
            vscode.window.showErrorMessage(vscode.l10n.t('Could not find app or container type'));
            return;
        }

        const params: CreatePostmanConfigParams = {
            appId,
            objectId,
            displayName: displayName || appId,
            containerType
        };

        const pmEnv = await CreatePostmanConfig.run(params);
        if (!pmEnv) {
            vscode.window.showErrorMessage(vscode.l10n.t('Failed to create Postman environment'));
            return;
        }

        // Warn about plaintext secrets if one was created
        const hasSecret = pmEnv.values.some(v =>
            v.key === 'ClientSecret' && v.value && !v.value.startsWith('<')
        );
        if (hasSecret) {
            const message = vscode.l10n.t("This will put your app's secret on your clipboard in plain text. Are you sure you want to continue?");
            const userChoice = await vscode.window.showInformationMessage(
                message,
                vscode.l10n.t('OK'), vscode.l10n.t('Cancel')
            );
            if (userChoice === vscode.l10n.t('Cancel')) {
                return;
            }
        }

        try {
            await vscode.env.clipboard.writeText(JSON.stringify(pmEnv, null, 2));
            vscode.window.showInformationMessage(
                vscode.l10n.t('Postman environment copied to clipboard for {0}', pmEnv.name)
            );
        } catch (error) {
            vscode.window.showErrorMessage(vscode.l10n.t('Failed to copy Postman environment'));
        }
    }
}

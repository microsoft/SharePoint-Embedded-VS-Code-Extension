/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../../Command';
import { GuestApplicationTreeItem } from '../../../views/treeview/development/GuestAppTreeItem';
import { OwningAppTreeItem } from '../../../views/treeview/development/OwningAppTreeItem';
import { App } from '../../../models/App';
import { ContainerType } from '../../../models/ContainerType';
import { AppTreeItem } from '../../../views/treeview/development/AppTreeItem';
import { CreatePostmanConfig } from './CreatePostmanConfig';

// Static class that handles the Postman copy command
export class CopyPostmanConfig extends Command {
    // Command name
    public static readonly COMMAND = 'App.Postman.copyEnvironmentFile';

    // Command handler
    public static async run(applicationTreeItem?: AppTreeItem): Promise<void> {
        if (!applicationTreeItem) {
            return;
        }

        let app: App | undefined;
        let containerType: ContainerType | undefined;
        if (applicationTreeItem instanceof GuestApplicationTreeItem) {
            app = applicationTreeItem.appPerms.app;
            containerType = applicationTreeItem.appPerms.containerTypeRegistration.containerType;
        }
        if (applicationTreeItem instanceof OwningAppTreeItem) {
            app = applicationTreeItem.containerType.owningApp!;
            containerType = applicationTreeItem.containerType;
        }
        if (!app || !containerType) {
            vscode.window.showErrorMessage(vscode.l10n.t('Could not find app or container type'));
            return;
        }

        const pmEnv = await CreatePostmanConfig.run(applicationTreeItem, app, containerType);
        if (!pmEnv) {
            vscode.window.showErrorMessage(vscode.l10n.t('Failed to create Postman environment'));
            return;
        }

        if (await app.hasCert() === true || await app.hasSecret() === true) {
            const message = vscode.l10n.t("This will put your app's secret and other settings in a plain text Postman environment file on your clipboard. Are you sure you want to continue?");
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
            const message = vscode.l10n.t('Postman environment copied to clipboard for {0}', pmEnv.name);
            vscode.window.showInformationMessage(message);
        } catch (error) {
            vscode.window.showErrorMessage(vscode.l10n.t('Failed to copy Postman environment'));
        }
    }
}

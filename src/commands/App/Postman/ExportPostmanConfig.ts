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
import * as fs from 'fs';
import * as path from 'path';
import { CreatePostmanConfig } from './CreatePostmanConfig';
import { TelemetryProvider } from '../../../services/TelemetryProvider';
import { ExportPostmanConfigFailure } from '../../../models/telemetry/telemetry';

// Static class that handles the Postman export command
export class ExportPostmanConfig extends Command {
    // Command name
    public static readonly COMMAND = 'App.Postman.exportEnvironmentFile';

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
            const messsage = vscode.l10n.t('Could not find app or container type');
            vscode.window.showErrorMessage(messsage);
            return;
        }

        const pmEnv = await CreatePostmanConfig.run(applicationTreeItem, app, containerType);
        if (!pmEnv) {
            const message = vscode.l10n.t('Failed to create Postman environment');
            vscode.window.showErrorMessage(message);
            return;
        }
        
        if (await app.hasCert() === true || await app.hasSecret() === true) {
            const message = vscode.l10n.t("This will put your app's secret and other settings in a plain text Postman environment file on your local machine. Are you sure you want to continue?");
            const userChoice = await vscode.window.showInformationMessage(
                message,
                vscode.l10n.t('OK'), vscode.l10n.t('Cancel')
            );
    
            if (userChoice === vscode.l10n.t('Cancel')) {
                return;
            }
        }
        
        try {
            const folders = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: vscode.l10n.t('Save Here'),
            });

            if (folders && folders.length > 0) {
                const destinationPath = folders[0].fsPath;
                const postmanEnvJson = JSON.stringify(pmEnv, null, 2);
                const postmanEnvPath = path.join(destinationPath, `${app.clientId}_postman_environment.json`);

                fs.writeFileSync(postmanEnvPath, postmanEnvJson, 'utf8');
                const message = vscode.l10n.t('Postman environment created successfully for {0}', pmEnv.name);
                vscode.window.showInformationMessage(message);
            } 
        } catch (error: any) {
            const message = vscode.l10n.t('Failed to download Postman environment');
            vscode.window.showErrorMessage(message);
            TelemetryProvider.instance.send(new ExportPostmanConfigFailure(error.message));
        }
    }
}

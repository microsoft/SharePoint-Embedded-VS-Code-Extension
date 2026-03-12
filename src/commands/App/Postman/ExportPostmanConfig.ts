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
import * as fs from 'fs';
import * as path from 'path';
import { CreatePostmanConfig, CreatePostmanConfigParams } from './CreatePostmanConfig';
import { TelemetryProvider } from '../../../services/TelemetryProvider';
import { ExportPostmanConfigFailure } from '../../../models/telemetry/telemetry';
import { GraphProvider } from '../../../services/Graph/GraphProvider';

// Static class that handles the Postman export command
export class ExportPostmanConfig extends Command {
    // Command name
    public static readonly COMMAND = 'App.Postman.exportEnvironmentFile';

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
                const postmanEnvPath = path.join(destinationPath, `${appId}_postman_environment.json`);

                fs.writeFileSync(postmanEnvPath, postmanEnvJson, 'utf8');
                vscode.window.showInformationMessage(
                    vscode.l10n.t('Postman environment created successfully for {0}', pmEnv.name)
                );
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(vscode.l10n.t('Failed to download Postman environment'));
            TelemetryProvider.instance.send(new ExportPostmanConfigFailure(error.message));
        }
    }
}

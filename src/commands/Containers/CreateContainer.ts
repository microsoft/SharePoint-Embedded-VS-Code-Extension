/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import { ContainersTreeItem } from '../../views/treeview/development/ContainersTreeItem';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';
import { TelemetryProvider } from '../../services/TelemetryProvider';
import { CreateContainerEvent, CreateContainerFailure } from '../../models/telemetry/telemetry';
import { Container } from '../../models/schemas';
import { ensureExtensionAppPermissions } from '../../utils/ExtensionAppPermissions';

// Static class that handles the create container command
export class CreateContainer extends Command {
    // Command name
    public static readonly COMMAND = 'Containers.create';

    // Command handler
    public static async run(containersViewModel?: ContainersTreeItem): Promise<Container | undefined> {
        if (!containersViewModel) {
            return;
        }
        const containerTypeId = containersViewModel.containerTypeId;

        const hasPermissions = await ensureExtensionAppPermissions(containerTypeId);
        if (!hasPermissions) {
            return;
        }

        const containerDisplayName = await vscode.window.showInputBox({
            placeHolder: vscode.l10n.t('Enter a display name for your new container'),
            prompt: vscode.l10n.t('Container display name'),
            validateInput: (value: string) => {
                const maxLength = 50;
                const alphanumericRegex = /^[a-zA-Z0-9\s-_]+$/;
                if (!value) {
                    return vscode.l10n.t('Display name cannot be empty');
                }
                if (value.length > maxLength) {
                    return vscode.l10n.t(`Display name must be no more than {0} characters long`, maxLength);
                }
                if (!alphanumericRegex.test(value)) {
                    return vscode.l10n.t('Display name must only contain alphanumeric characters');
                }
                return undefined;
            }
        });

        if (!containerDisplayName) {
            return;
        }

        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Creating container...'));
        progressWindow.show();
        try {
            const graphProvider = GraphProvider.getInstance();
            const container = await graphProvider.containers.create({
                displayName: containerDisplayName,
                containerTypeId
            });
            if (!container) {
                throw new Error(vscode.l10n.t('Failed to create container'));
            }
            DevelopmentTreeViewProvider.getInstance().refresh(containersViewModel);
            vscode.window.showInformationMessage(
                vscode.l10n.t('Container "{0}" created successfully.', container.displayName)
            );
            progressWindow.hide();
            TelemetryProvider.instance.send(new CreateContainerEvent());
            return container;
        } catch (error: any) {
            progressWindow.hide();
            let errorMessage = vscode.l10n.t('Unable to create container: {0}', error.message);

            if (error.statusCode === 403 || error.code === 'Forbidden' || /access denied/i.test(error.message)) {
                errorMessage = vscode.l10n.t(
                    'Access denied. This can happen if permissions have not finished propagating. Please wait a few minutes and try again.'
                );
            }

            vscode.window.showErrorMessage(errorMessage);
            TelemetryProvider.instance.send(new CreateContainerFailure(error.message));
            return;
        }
    }
}

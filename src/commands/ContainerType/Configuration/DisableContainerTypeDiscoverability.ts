/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../../Command';
import * as vscode from 'vscode';
import { ContainerTypeTreeItem } from '../../../views/treeview/development/ContainerTypeTreeItem';
import { ContainerType } from '../../../models/schemas';
import { GraphProvider } from '../../../services/Graph/GraphProvider';
import { DevelopmentTreeViewProvider } from '../../../views/treeview/development/DevelopmentTreeViewProvider';
import { ProgressWaitNotification } from '../../../views/notifications/ProgressWaitNotification';

// Static class that handles the disable discoverability command
export class DisableContainerTypeDiscoverability extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.disableDiscoverability';

    // Command handler
    public static async run(commandProps?: DisableDiscoverabilityCommandProps): Promise<void> {
        if (!commandProps) {
            return;
        }

        let containerType: ContainerType;
        if (commandProps instanceof ContainerTypeTreeItem) {
            containerType = commandProps.containerType;
        } else {
            containerType = commandProps;
        }
        if (!containerType) {
            return;
        }

        const progressWindow = new ProgressWaitNotification(
            vscode.l10n.t('Disabling discoverability...')
        );
        progressWindow.show();

        try {
            const graphProvider = GraphProvider.getInstance();

            // Get the latest container type to ensure we have the current etag
            const latestCT = await graphProvider.containerTypes.get(containerType.id);
            if (!latestCT) {
                throw new Error('Container type not found');
            }

            const etag = latestCT.etag;
            if (!etag) {
                throw new Error('Container type etag not available - cannot update');
            }

            // Update the container type settings
            await graphProvider.containerTypes.update(
                containerType.id,
                { settings: { isDiscoverabilityEnabled: false } },
                etag
            );

            progressWindow.hide();
            vscode.window.showInformationMessage(
                vscode.l10n.t('Discoverability has been disabled for "{0}".', containerType.name)
            );

            // Refresh the tree view
            DevelopmentTreeViewProvider.getInstance().refresh();
        } catch (error: any) {
            progressWindow.hide();
            console.error('[DisableContainerTypeDiscoverability] Error:', error);

            let errorMessage = vscode.l10n.t('Failed to disable discoverability');
            if (error.message) {
                errorMessage += `: ${error.message}`;
            }

            vscode.window.showErrorMessage(errorMessage);
        }
    }
}

export type DisableDiscoverabilityCommandProps = ContainerTypeTreeItem | ContainerType;

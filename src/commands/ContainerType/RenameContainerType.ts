/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { ContainerType } from '../../models/schemas';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';

// Static class that handles the rename container type command
export class RenameContainerType extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.rename';

    // Command handler
    public static async run(containerTypeViewModel?: ContainerTypeTreeItem): Promise<void> {
        if (!containerTypeViewModel) {
            return;
        }

        const containerType: ContainerType = containerTypeViewModel.containerType;
        const currentName = containerType.name;

        // Prompt for new name
        const newName = await vscode.window.showInputBox({
            prompt: vscode.l10n.t('Enter a new name for the container type'),
            value: currentName,
            validateInput: (value: string) => {
                if (!value || value.trim().length === 0) {
                    return vscode.l10n.t('Name cannot be empty');
                }
                if (value.length > 50) {
                    return vscode.l10n.t('Name must be no more than 50 characters');
                }
                const alphanumericRegex = /^[a-zA-Z0-9\s-_]+$/;
                if (!alphanumericRegex.test(value)) {
                    return vscode.l10n.t('Name must only contain alphanumeric characters, spaces, hyphens, and underscores');
                }
                if (value === currentName) {
                    return vscode.l10n.t('Please enter a different name');
                }
                return undefined;
            }
        });

        if (!newName) {
            return; // User cancelled
        }

        const progressWindow = new ProgressWaitNotification(
            vscode.l10n.t('Renaming container type...')
        );
        progressWindow.show();

        try {
            const graphProvider = GraphProvider.getInstance();

            // Get the latest container type to ensure we have the current etag
            const latestContainerType = await graphProvider.containerTypes.get(containerType.id);
            if (!latestContainerType) {
                throw new Error('Container type not found');
            }

            const etag = latestContainerType.etag;
            if (!etag) {
                throw new Error('Container type etag not available - cannot update');
            }

            // Update the container type with the new name
            await graphProvider.containerTypes.update(
                containerType.id,
                { name: newName.trim() },
                etag
            );

            progressWindow.hide();
            vscode.window.showInformationMessage(
                vscode.l10n.t('Container type renamed to "{0}".', newName.trim())
            );

            // Refresh the tree view
            DevelopmentTreeViewProvider.getInstance().refresh();
        } catch (error: any) {
            progressWindow.hide();
            console.error('[RenameContainerType] Error renaming container type:', error);

            let errorMessage = vscode.l10n.t('Failed to rename container type');
            if (error.message) {
                errorMessage += `: ${error.message}`;
            }

            // Check for common error scenarios
            if (error.statusCode === 409 || error.code === 'Conflict') {
                errorMessage = vscode.l10n.t(
                    'The container type was modified by another user. Please refresh and try again.'
                );
            } else if (error.statusCode === 403 || error.code === 'Forbidden') {
                errorMessage = vscode.l10n.t(
                    'You do not have permission to rename this container type.'
                );
            }

            vscode.window.showErrorMessage(errorMessage);
        }
    }
}

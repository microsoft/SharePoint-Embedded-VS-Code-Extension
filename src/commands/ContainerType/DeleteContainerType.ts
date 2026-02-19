/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { ContainerType } from '../../models/schemas';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';

// Static class that handles the delete container type command
export class DeleteContainerType extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.delete';

    // Command handler
    public static async run(commandProps?: DeletionCommandProps): Promise<void> {
        if (!commandProps) {
            return;
        }

        // Extract container type info from command props
        const { id, name } = getContainerTypeInfo(commandProps);
        if (!id) {
            vscode.window.showErrorMessage(vscode.l10n.t('Could not determine container type ID'));
            return;
        }

        // Confirm deletion with user
        const confirmMessage = vscode.l10n.t(
            'Are you sure you want to delete the container type "{0}"? This action cannot be undone.',
            name || id
        );
        const deleteButton = vscode.l10n.t('Delete');
        const cancelButton = vscode.l10n.t('Cancel');

        const selection = await vscode.window.showWarningMessage(
            confirmMessage,
            { modal: true },
            deleteButton,
            cancelButton
        );

        if (selection !== deleteButton) {
            return;
        }

        // Delete the container type
        const progressWindow = new ProgressWaitNotification(
            vscode.l10n.t('Deleting container type...')
        );
        progressWindow.show();

        try {
            const graphProvider = GraphProvider.getInstance();
            await graphProvider.containerTypes.delete(id);

            progressWindow.hide();
            vscode.window.showInformationMessage(
                vscode.l10n.t('Container type "{0}" has been deleted.', name || id)
            );

            // Refresh the tree view
            DevelopmentTreeViewProvider.getInstance().refresh();
        } catch (error: any) {
            progressWindow.hide();
            console.error('[DeleteContainerType] Error deleting container type:', error);

            let errorMessage = vscode.l10n.t('Failed to delete container type');
            if (error.message) {
                errorMessage += `: ${error.message}`;
            }

            // Check for common error scenarios
            if (error.statusCode === 400 || error.code === 'BadRequest') {
                errorMessage = vscode.l10n.t(
                    'Cannot delete container type. Make sure all containers are deleted and the container type is unregistered from all tenants first.'
                );
            } else if (error.statusCode === 403 || error.code === 'Forbidden') {
                errorMessage = vscode.l10n.t(
                    'You do not have permission to delete this container type.'
                );
            } else if (error.statusCode === 404 || error.code === 'NotFound') {
                errorMessage = vscode.l10n.t(
                    'Container type not found. It may have already been deleted.'
                );
                // Still refresh the tree view since it's gone
                DevelopmentTreeViewProvider.getInstance().refresh();
            }

            vscode.window.showErrorMessage(errorMessage);
        }
    }
}

/**
 * Helper to extract container type info from various input types
 */
function getContainerTypeInfo(props: DeletionCommandProps): { id: string | undefined; name: string | undefined } {
    if (props instanceof ContainerTypeTreeItem) {
        return {
            id: props.containerType.id,
            name: props.containerType.name
        };
    }

    return {
        id: props.id,
        name: props.name
    };
}

export type DeletionCommandProps = ContainerTypeTreeItem | ContainerType;

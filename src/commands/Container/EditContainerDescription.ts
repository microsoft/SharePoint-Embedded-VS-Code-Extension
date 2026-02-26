/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';
import { ContainerTreeItem } from '../../views/treeview/development/ContainerTreeItem';

// Static class that handles the edit container description command
export class EditContainerDescription extends Command {
    // Command name
    public static readonly COMMAND = 'Container.editDescription';

    // Command handler
    public static async run(containerViewModel?: ContainerTreeItem): Promise<void> {
        if (!containerViewModel) {
            return;
        }
        const container = containerViewModel.container;
        const containerDescription = await vscode.window.showInputBox({
            title: vscode.l10n.t('New description'),
            value: container.description,
            prompt: vscode.l10n.t('Enter the new description for the container:'),
            validateInput: (value: string): string | undefined => {
                const maxLength = 300;
                const alphanumericRegex = /^[a-zA-Z0-9\s-_.]+$/;
                if (value.length > maxLength) {
                    return vscode.l10n.t(`Container description must be no more than {0} characters long`, maxLength);
                }
                if (!alphanumericRegex.test(value)) {
                    return vscode.l10n.t('Container description must only contain alphanumeric characters');
                }
                return undefined;
            }
        });

        if (containerDescription === undefined) {
            return;
        }

        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Saving new container description...'));
        progressWindow.show();
        try {
            const graphProvider = GraphProvider.getInstance();
            await graphProvider.containers.update(container.id, { description: containerDescription || '' });
            DevelopmentTreeViewProvider.getInstance().refresh(containerViewModel.registrationViewModel);
            progressWindow.hide();
        } catch (error: any) {
            progressWindow.hide();
            const message = vscode.l10n.t('Unable to edit container object: {0}', error.message);
            vscode.window.showErrorMessage(message);
        }
    }
}

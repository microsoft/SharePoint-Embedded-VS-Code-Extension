/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import { ContainerType } from '../../models/ContainerType';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { App } from '../../models/App';
import { GraphProvider } from '../../services/GraphProvider';
import { Container } from '../../models/Container';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';
import { ContainerTreeItem } from '../../views/treeview/development/ContainerTreeItem';

// Static class that handles the edit container description command
export class EditContainerDescription extends Command {
    // Command name
    public static readonly COMMAND = 'Container.editDescription';

    // Command handler
    public static async run(containerViewModel?: ContainerTreeItem): Promise<Container | undefined> {
        if (!containerViewModel) {
            return;
        }
        const containerType: ContainerType = containerViewModel.container.registration.containerType;
        const containerTypeRegistration = containerViewModel.container.registration;
        const container: Container = containerViewModel.container;
        const owningApp: App = containerType.owningApp!;
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
            const authProvider = await owningApp.getAppOnlyAuthProvider(containerTypeRegistration.tenantId);
            const graphProvider = new GraphProvider(authProvider);
            const updatedContainer = await graphProvider.updateContainer(containerTypeRegistration, container.id, container.displayName, containerDescription || '');
            if (!updatedContainer) {
                throw new Error (vscode.l10n.t("Failed to change container description"));
            }
            DevelopmentTreeViewProvider.getInstance().refresh(containerViewModel.reigstrationViewModel);
            progressWindow.hide();
            return updatedContainer;
        } catch (error: any) {
            progressWindow.hide();
            const message = vscode.l10n.t('Unable to edit container object: {0}', error.message);
            vscode.window.showErrorMessage(message);
            return;
        }
    }
}

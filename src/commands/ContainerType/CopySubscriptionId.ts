/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { Command } from '../Command';
import { ContainerType } from '../../models/ContainerType';

// Static class that handles the copy subscription id command
export class CopySubscriptionId extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.copySubscriptionId';

    // Command handler
    public static async run(containerTypeViewModel?: ContainerTypeTreeItem): Promise<void> {
        if (!containerTypeViewModel) {
            return;
        }
        const containerType: ContainerType = containerTypeViewModel.containerType;
        try {
            const azureSubscriptionId = containerType.azureSubscriptionId;
            await vscode.env.clipboard.writeText(azureSubscriptionId ? azureSubscriptionId : '');
            vscode.window.showInformationMessage(vscode.l10n.t('Azure subscription id copied to clipboard.'));
        } catch (error: any) {
            const message = vscode.l10n.t('Failed to copy Azure subscription id to clipboard: {0}', error.message);
            vscode.window.showErrorMessage(message);
            return;
        }
    }
}

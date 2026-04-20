/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { Command } from '../Command';
import { ContainerType } from '../../models/schemas';

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
            // TODO: azureSubscriptionId is not available in Graph API schema
            // This property comes from SharePoint Admin API which needs to be integrated
            vscode.window.showWarningMessage(vscode.l10n.t('Azure subscription id is not yet available via Graph API. This feature will be available after SharePoint Admin API integration.'));
        } catch (error: any) {
            const message = vscode.l10n.t('Failed to copy Azure subscription id to clipboard: {0}', error.message);
            vscode.window.showErrorMessage(message);
            return;
        }
    }
}

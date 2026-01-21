/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { Command } from '../Command';
import { ContainerType } from '../../models/schemas';
import { AuthenticationState } from '../../services/AuthenticationState';

// Static class that handles the owning tenant id command
export class CopyOwningTenantId extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.copyOwningTenantId';

    // Command handler
    public static async run(containerTypeViewModel?: ContainerTypeTreeItem): Promise<void> {
        if (!containerTypeViewModel) {
            return;
        }
        const containerType: ContainerType = containerTypeViewModel.containerType;
        try {
            // TODO: owningTenantId is not available in Graph API schema
            // For now, use the current tenant ID from auth state
            const account = await AuthenticationState.getCurrentAccount();
            const owningTenantId = account?.tenantId || '';

            if (!owningTenantId) {
                vscode.window.showWarningMessage(vscode.l10n.t('Owning tenant Id not available'));
                return;
            }

            await vscode.env.clipboard.writeText(owningTenantId);
            vscode.window.showInformationMessage(vscode.l10n.t('Owning tenant Id copied to clipboard.'));
        } catch (error: any) {
            const message = vscode.l10n.t('Failed to copy Owning tenant Id to clipboard: {0}', error.message);
            vscode.window.showErrorMessage(message);
            return;
        }
    }
}

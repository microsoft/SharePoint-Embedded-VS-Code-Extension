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
        if (!AuthenticationState.isSignedIn()) {
            vscode.window.showErrorMessage('Please sign in to copy the owning tenant ID.');
            return;
        }
        
        const account = await AuthenticationState.getCurrentAccount();
        if (!account) {
            vscode.window.showErrorMessage('Failed to get account information.');
            return;
        }
        
        const owningTenantId = account.tenantId;
        await vscode.env.clipboard.writeText(owningTenantId);
        vscode.window.showInformationMessage(vscode.l10n.t('Owning tenant Id copied to clipboard.'));
    }
}

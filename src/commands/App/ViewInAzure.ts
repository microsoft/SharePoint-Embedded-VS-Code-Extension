/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { AppTreeItem } from '../../views/treeview/development/AppTreeItem';
import { AzurePortalUrlProvider } from '../../utils/AzurePortalUrl';
import { GuestApplicationTreeItem } from '../../views/treeview/development/GuestAppTreeItem';
import { OwningAppTreeItem } from '../../views/treeview/development/OwningAppTreeItem';
import { Application } from '../../models/schemas';

// Static class that views app in Azure
export class ViewInAzure extends Command {
    // Command name
    public static readonly COMMAND = 'App.viewInAzure';

    // Command handler
    public static async run(commandProps?: ViewInAzureProps): Promise<void> {
        if (!commandProps) {
            return;
        }

        let appId: string | undefined;

        if (commandProps instanceof GuestApplicationTreeItem) {
            appId = commandProps.appPerms?.app?.clientId;
        } else if (commandProps instanceof OwningAppTreeItem) {
            appId = commandProps.containerType.owningAppId;
        } else if ('appId' in commandProps) {
            // New Application schema
            appId = commandProps.appId ?? undefined;
        } else if ('clientId' in commandProps) {
            // Legacy App model
            appId = (commandProps as any).clientId;
        }

        if (!appId) {
            vscode.window.showErrorMessage(vscode.l10n.t('Could not find app'));
            return;
        }

        const azureLink = AzurePortalUrlProvider.getAppRegistrationUrl(appId);
        vscode.env.openExternal(vscode.Uri.parse(azureLink));
    };
}

export type ViewInAzureProps = AppTreeItem | Application | { clientId: string };

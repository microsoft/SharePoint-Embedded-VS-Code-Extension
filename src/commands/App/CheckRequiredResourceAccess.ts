/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { App } from '../../models/App';
import { AppTreeItem } from '../../views/treeview/development/AppTreeItem';
import { GuestApplicationTreeItem } from '../../views/treeview/development/GuestAppTreeItem';
import { OwningAppTreeItem } from '../../views/treeview/development/OwningAppTreeItem';
import { Command } from '../Command';

// Static class that handles checks if a given scope exists in an apps resource access array command
export class CheckRequiredResourceAccess extends Command {
    // Command name
    public static readonly COMMAND = 'App.checkRequiredResourceAccess';

    // Command handler
    public static async run(app?: App, resource?: string, scope?: string): Promise<boolean> {
        if (!app || !scope || !resource) {
            return false;
        }

        const appId = app.clientId;
        if (!appId) {
            return false;
        }

        const resourceAccess = app.requiredResourceAccess;
        if (!resourceAccess) {
            return false;;
        }

        const resourceAppPermissions = resourceAccess.filter((resourceAccess) => resourceAccess.resourceAppId === resource);
        if (!resourceAppPermissions) {
            return false;
        }

        let hasScope = false;
        resourceAppPermissions.forEach((resourceAppPermission) => {
            const scopes = resourceAppPermission.resourceAccess?.filter((resourceAccess) => resourceAccess && resourceAccess.id === scope);
            if (scopes && scopes.length > 0) {
            hasScope = true;
            }
        });

        return hasScope;
    }
}
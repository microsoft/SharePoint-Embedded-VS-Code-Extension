/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../../Command';
import { App } from '../../../models/App';
import { GetAccount } from '../../Accounts/GetAccount';
import { AppTreeItem } from '../../../views/treeview/development/AppTreeItem';
import { DevelopmentTreeViewProvider } from '../../../views/treeview/development/DevelopmentTreeViewProvider';
import { GuestApplicationTreeItem } from '../../../views/treeview/development/GuestAppTreeItem';
import { OwningAppTreeItem } from '../../../views/treeview/development/OwningAppTreeItem';

// Static class that deletes locally-saved cert details for an app
export class ForgetAppCert extends Command {
    // Command name
    public static readonly COMMAND = 'App.Credentials.deleteCert';

    // Command handler
    public static async run(commandProps?: DeleteCertProps): Promise<App | undefined> {
        const account = await GetAccount.run();
        if (!account) {
            return;
        }

        let app: App | undefined;
        if (commandProps instanceof AppTreeItem) {
            if (commandProps instanceof GuestApplicationTreeItem) {
                app = commandProps.appPerms.app;
            }
            if (commandProps instanceof OwningAppTreeItem) {
                app = commandProps.containerType.owningApp!;
            }
        } else {
            app = commandProps;
        }
        if (!app) {
            return;
        }

        const appSecrets = await app.getSecrets();
        appSecrets.thumbprint = undefined;
        appSecrets.privateKey = undefined;
        await app.setSecrets(appSecrets);
        DevelopmentTreeViewProvider.instance.refresh();
    };
}

export type DeleteCertProps = AppTreeItem | App;

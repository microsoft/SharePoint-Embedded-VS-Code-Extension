/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { ContainerType } from '../../models/ContainerType';
import { GetAccount } from '../Accounts/GetAccount';
import { GetOrCreateApp } from '../Apps/GetOrCreateApp';
import { RegisterOnLocalTenant } from '../ContainerType/RegisterOnLocalTenant';
import { App, AppType } from '../../models/App';
import { GuestAppsTreeItem } from '../../views/treeview/development/GuestAppsTreeItem';
import { ApplicationPermissions } from '../../models/ApplicationPermissions';
import { ISpConsumingApplicationProperties } from '../../services/SPAdminProvider';
import { ChooseAppPermissions } from './ChooseAppPermissions';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';
import { ContainerTypeRegistration } from '../../models/ContainerTypeRegistration';

// Static class that handles the create guest app command
export class GetorCreateGuestApp extends Command {
    // Command name
    public static readonly COMMAND = 'GuestApps.add';

    // Command handler
    public static async run(guestAppsTreeItem?: GuestAppsTreeItem): Promise<App | undefined> {
        if (!guestAppsTreeItem) {
            return;
        }

        const account = await GetAccount.run();
        if (!account) {
            return;
        }

        const containerType: ContainerType = guestAppsTreeItem.containerType;
        
        if (!containerType) {
            return;
        }
        
        const app = await GetOrCreateApp.run(AppType.GuestApp);
        if (!app) {
            return;
        }

        const selectedPerms = await ChooseAppPermissions.run();
        if (!selectedPerms) {
            return;
        }

        const loadRegistrationProgress = new ProgressWaitNotification(vscode.l10n.t('Loading existing container type registration for update...'));
        loadRegistrationProgress.show();
        let containerTypeRegistration: ContainerTypeRegistration | undefined;
        try {
            containerTypeRegistration = await containerType.loadLocalRegistration();
            loadRegistrationProgress.hide();
            if (!containerTypeRegistration) {
                throw new Error(vscode.l10n.t('Existing registration not found.'));
            }
        } catch (error: any) {
            loadRegistrationProgress.hide();
            const message = vscode.l10n.t('Error loading container type registration: {0}', error);
            vscode.window.showErrorMessage(message);
            return;
        }

        const newApplicationPermissions: ISpConsumingApplicationProperties = {
            OwningApplicationId: containerType.owningApp!.clientId,
            DelegatedPermissions: selectedPerms.delegatedPerms,
            AppOnlyPermissions: selectedPerms.applicationPerms,
            TenantId: account.tenantId,
            ContainerTypeId: containerType.containerTypeId,
            ApplicationId: app.clientId,
            ApplicationName: app.displayName,
            Applications: containerTypeRegistration!.applications,
            OwningApplicationName:containerType.owningApp!.displayName,
        };
        const appPermissionsToRegister = new ApplicationPermissions(containerTypeRegistration!, newApplicationPermissions);
        await RegisterOnLocalTenant.run(containerType, appPermissionsToRegister);
        return app;
    }
}

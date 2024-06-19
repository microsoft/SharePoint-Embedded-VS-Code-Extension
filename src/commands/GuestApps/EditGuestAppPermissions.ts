/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { ContainerType } from '../../models/ContainerType';
import { GetAccount } from '../Accounts/GetAccount';
import { RegisterOnLocalTenant } from '../ContainerType/RegisterOnLocalTenant';
import { App } from '../../models/App';
import { ApplicationPermissions } from '../../models/ApplicationPermissions';
import { ISpConsumingApplicationProperties } from '../../services/SpAdminProvider';
import { GuestApplicationTreeItem } from '../../views/treeview/development/GuestAppTreeItem';
import { ChooseAppPermissions } from './ChooseAppPermissions';
import { ProgressWaitNotification } from '../../views/notifications/ProgressWaitNotification';
import { ContainerTypeRegistration } from '../../models/ContainerTypeRegistration';

// Static class that handles the create guest app command
export class EditGuestAppPermissions extends Command {
    // Command name
    public static readonly COMMAND = 'GuestApp.editPermissions';

    // Command handler
    public static async run(guestAppTreeItem?: GuestApplicationTreeItem): Promise<App | undefined> {
        if (!guestAppTreeItem) {
            return;
        }

        const account = await GetAccount.run();
        if (!account) {
            return;
        }

        const containerType: ContainerType = guestAppTreeItem.appPerms.containerTypeRegistration.containerType;
        if (!containerType) {
            return;
        }
        
        const app = guestAppTreeItem.appPerms.app;
        if (!app) {
            return;
        }

        const selectedPerms = await ChooseAppPermissions.run(guestAppTreeItem.appPerms);
        if (!selectedPerms) {
            return;
        }

        const loadRegistrationProgress = new ProgressWaitNotification('Loading existing container type registration for update...');
        loadRegistrationProgress.show();
        let containerTypeRegistration: ContainerTypeRegistration | undefined;
        try {
            containerTypeRegistration = await containerType.loadLocalRegistration();
            loadRegistrationProgress.hide();
            if (!containerTypeRegistration) {
                throw new Error('Existing registration not found.');
            }
        } catch (error) {
            loadRegistrationProgress.hide();
            vscode.window.showErrorMessage('Error loading container type registration: ' + error);
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




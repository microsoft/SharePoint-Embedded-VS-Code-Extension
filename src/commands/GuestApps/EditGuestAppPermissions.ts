/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { BillingClassification, ContainerType } from '../../models/ContainerType';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { GetAccount } from '../Accounts/GetAccount';
import { GetOrCreateApp } from '../Apps/GetOrCreateApp';
import { RegisterOnLocalTenant } from '../ContainerType/RegisterOnLocalTenant';
import { AppType } from '../../models/App';
import { AddGuestAppFlowState, AddGuestAppFlow } from '../../views/qp/UxFlows';
import { ApplicationPermissions } from '../../models/ApplicationPermissions';
import { ISpConsumingApplicationProperties } from '../../services/SpAdminProviderNew';
import { GuestApplicationTreeItem } from '../../views/treeview/development/GuestAppTreeItem';

// Static class that handles the create guest app command
export class EditGuestAppPermissions extends Command {
    // Command name
    public static readonly COMMAND = 'GuestApp.editPermissions';

    // Command handler
    public static async run(guestAppTreeItem?: GuestApplicationTreeItem): Promise<ContainerType | undefined> {
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

        let addGuestAppState: AddGuestAppFlowState | undefined;
        try {
            addGuestAppState = await new AddGuestAppFlow(containerType, guestAppTreeItem.appPerms.delegated, guestAppTreeItem.appPerms.appOnly).run();
            if (addGuestAppState === undefined) {
                return;
            }
        } catch (error) {
            return;
        }

        const appDelegatedPerms = addGuestAppState.delegatedPerms;
        const appPerms = addGuestAppState.applicationPerms;

        const containerTypeRegistration = await containerType.loadLocalRegistration();
        const newApplicationPermissions: ISpConsumingApplicationProperties = {
            OwningApplicationId: containerType.owningApp!.clientId,
            DelegatedPermissions: appDelegatedPerms,
            AppOnlyPermissions: appPerms,
            TenantId: account.tenantId,
            ContainerTypeId: containerType.containerTypeId,
            ApplicationId: app.clientId,
            ApplicationName: app.displayName,
            Applications: containerTypeRegistration!.applications,
            OwningApplicationName:containerType.owningApp!.displayName,
        };

        const appPermissionsToRegister = new ApplicationPermissions(containerTypeRegistration!, newApplicationPermissions);

        await RegisterOnLocalTenant.run(containerType, appPermissionsToRegister);
        return containerType;
    }
}




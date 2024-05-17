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
import { GuestAppsTreeItem } from '../../views/treeview/development/GuestAppsTreeItem';
import { AddGuestAppFlowState, AddGuestAppFlow } from '../../views/qp/UxFlows';
import { ApplicationPermissions } from '../../models/ApplicationPermissions';
import { ISpConsumingApplicationProperties } from '../../services/SpAdminProviderNew';

// Static class that handles the create guest app command
export class GetorCreateGuestApp extends Command {
    // Command name
    public static readonly COMMAND = 'GuestApps.add';

    // Command handler
    public static async run(guestAppsTreeItem?: GuestAppsTreeItem): Promise<ContainerType | undefined> {
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

        let addGuestAppState: AddGuestAppFlowState | undefined;
        try {
            addGuestAppState = await new AddGuestAppFlow(containerType).run();
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

        const register = 'Register on local tenant';
        const buttons = [register];
        const selection = await vscode.window.showInformationMessage(
            `Your container type has been created. Would you like to register it on your local tenant?`,
            ...buttons
        );
        if (selection === register) {
            RegisterOnLocalTenant.run(containerType, appPermissionsToRegister);
        }
        return containerType;
    }
}




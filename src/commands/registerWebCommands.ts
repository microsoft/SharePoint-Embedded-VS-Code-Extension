/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CopyAppId } from './App/CopyAppId';
import { CopyPostmanConfig } from './App/Postman/CopyPostmanConfig';
import { OpenPostmanDocumentation } from './App/Postman/OpenPostmanDocumentation';
import { RenameApp } from './App/RenameApp';
import { ViewInAzure } from './App/ViewInAzure';
import { GetOrCreateApp } from './Apps/GetOrCreateApp';
import { CopyContainerId } from './Container/CopyContainerId';
import { EditContainerDescription } from './Container/EditContainerDescription';
import { RecycleContainer } from './Container/RecycleContainer';
import { RenameContainer } from './Container/RenameContainer';
import { ViewContainerProperties } from './Container/ViewContainerProperties';
import { BrowseGraphExplorer } from './ContainerType/BrowseGraphExplorer';
import { CopyContainerTypeId } from './ContainerType/CopyContainerTypeId';
import { CopyOwningTenantId } from './ContainerType/CopyOwningTenantId';
import { CopySubscriptionId } from './ContainerType/CopySubscriptionId';
import { DisableContainerTypeDiscoverability } from './ContainerType/Configuration/DisableContainerTypeDiscoverability';
import { EnableContainerTypeDiscoverability } from './ContainerType/Configuration/EnableContainerTypeDiscoverability';
import { LearnMoreDiscoverability } from './ContainerType/Configuration/LearnMoreDiscoverability';
import { DeleteContainerType } from './ContainerType/DeleteContainerType';
import { GrantExtensionAppPermissions } from './ContainerType/GrantExtensionAppPermissions';
import { OpenStorageExplorer } from './ContainerType/OpenStorageExplorer';
import { RenameContainerType } from './ContainerType/RenameContainerType';
import { ViewContainerTypeProperties } from './ContainerType/ViewContainerTypeProperties';
import { AddConnectorPermissions } from './GuestApps/AddConnectorPermissions';
import { AddExtensionPermissions } from './GuestApps/AddExtensionPermissions';
import { AddGraphExplorerPermissions } from './GuestApps/AddGraphExplorerPermissions';
import { EditGuestAppPermissions } from './GuestApps/EditGuestAppPermissions';
import { GetorCreateGuestApp } from './GuestApps/GetorCreateGuestApp';
import { RemoveGuestApp } from './GuestApps/RemoveGuestApp';
import { CopyRecycledContainerId } from './RecycledContainer/CopyContainerId';
import { DeleteContainer } from './RecycledContainer/DeleteContainer';
import { RestoreContainer } from './RecycledContainer/RestoreContainer';

interface RegisterableCommand {
    register(context: vscode.ExtensionContext): void;
}

const WEB_SAFE_COMMANDS: RegisterableCommand[] = [
    CopyContainerTypeId,
    CopyOwningTenantId,
    CopySubscriptionId,
    ViewContainerTypeProperties,
    BrowseGraphExplorer,
    OpenStorageExplorer,
    RenameContainerType,
    LearnMoreDiscoverability,
    EnableContainerTypeDiscoverability,
    DisableContainerTypeDiscoverability,
    GrantExtensionAppPermissions,
    DeleteContainerType,
    GetOrCreateApp,
    GetorCreateGuestApp,
    AddGraphExplorerPermissions,
    AddConnectorPermissions,
    AddExtensionPermissions,
    CopyPostmanConfig,
    OpenPostmanDocumentation,
    ViewInAzure,
    RenameApp,
    CopyAppId,
    EditGuestAppPermissions,
    RemoveGuestApp,
    RenameContainer,
    EditContainerDescription,
    RecycleContainer,
    CopyContainerId,
    ViewContainerProperties,
    CopyRecycledContainerId,
    DeleteContainer,
    RestoreContainer,
];

const DESKTOP_ONLY_COMMANDS = [
    'spe.ContainerTypes.create',
    'spe.ContainerTypes.createTrial',
    'spe.ContainerTypes.createPaid',
    'spe.ContainerType.registerOnLocalTenant',
    'spe.ContainerType.attachBilling',
    'spe.App.Postman.exportEnvironmentFile',
    'spe.App.Permissions.LocalAdminConsent.openLink',
    'spe.App.SampleApps.ASPNET+C#.clone',
    'spe.App.SampleApps.TypeScript+React+AzureFunctions.clone',
    'spe.Containers.create',
];

export function registerWebResourceCommands(context: vscode.ExtensionContext): void {
    for (const command of WEB_SAFE_COMMANDS) {
        command.register(context);
    }

    for (const commandId of DESKTOP_ONLY_COMMANDS) {
        context.subscriptions.push(vscode.commands.registerCommand(commandId, async () => {
            await vscode.window.showInformationMessage(vscode.l10n.t(
                'This command is not available in the vscode.dev spike yet.'
            ));
        }));
    }
}

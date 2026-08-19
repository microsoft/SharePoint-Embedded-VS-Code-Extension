/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from '@playwright/test';
import { mockModuleFor } from '../helpers/mock/moduleStub';
import { installVscodeStub } from '../helpers/mock/vscodeStub';

installVscodeStub();

const PARENT = 'commands/ContainerType/GrantExtensionAppPermissions.ts';
const CONTAINER_TYPE = { id: 'ct-1', name: 'Contoso Documents' };
const REGISTRATION = { id: 'registration-1' };

class StubContainerTypeTreeItem {
    public constructor(
        public readonly containerType: typeof CONTAINER_TYPE,
        public readonly registration: typeof REGISTRATION | null
    ) { }
}

class StubStorageExplorerTreeItem {
    public constructor(
        public readonly containerType: typeof CONTAINER_TYPE,
        public readonly registration: typeof REGISTRATION | null
    ) { }
}

class StubProgressWaitNotification {
    public show(): void { }
    public hide(): void { }
}

let checkedContainerTypeId: string | undefined;
let grantedContainerTypeId: string | undefined;
let handoff: { containerType: typeof CONTAINER_TYPE; registration: typeof REGISTRATION | null } | undefined;

mockModuleFor(PARENT, 'views/treeview/development/ContainerTypeTreeItem', {
    ContainerTypeTreeItem: StubContainerTypeTreeItem,
});
mockModuleFor(PARENT, 'views/treeview/development/StorageExplorerTreeItem', {
    StorageExplorerTreeItem: StubStorageExplorerTreeItem,
});
mockModuleFor(PARENT, 'views/notifications/ProgressWaitNotification', {
    ProgressWaitNotification: StubProgressWaitNotification,
});
mockModuleFor(PARENT, 'utils/ExtensionAppPermissions', {
    hasExtensionAppPermissions: async (containerTypeId: string): Promise<boolean> => {
        checkedContainerTypeId = containerTypeId;
        return false;
    },
    grantExtensionAppPermissions: async (containerTypeId: string): Promise<void> => {
        grantedContainerTypeId = containerTypeId;
    },
});
mockModuleFor(PARENT, 'views/treeview/development/DevelopmentTreeViewProvider', {
    DevelopmentTreeViewProvider: {
        getInstance: (): { refresh(): void } => ({ refresh: () => undefined }),
    },
});
mockModuleFor(PARENT, 'StorageExplorerHandoff', {
    openStorageExplorerWhenReady: async (
        containerType: typeof CONTAINER_TYPE,
        registration: typeof REGISTRATION | null
    ): Promise<boolean> => {
        handoff = { containerType, registration };
        return true;
    },
});

/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
const grantExtensionAppPermissionsCommand = require(
    '../../src/commands/ContainerType/GrantExtensionAppPermissions'
).GrantExtensionAppPermissions;
/* eslint-enable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */

test.beforeEach(() => {
    checkedContainerTypeId = undefined;
    grantedContainerTypeId = undefined;
    handoff = undefined;
});

test('Storage Explorer context-menu grant uses the row container type', async () => {
    const treeItem = new StubStorageExplorerTreeItem(CONTAINER_TYPE, REGISTRATION);

    const result = await grantExtensionAppPermissionsCommand.run(treeItem);

    expect(result).toBe(true);
    expect(checkedContainerTypeId).toBe(CONTAINER_TYPE.id);
    expect(grantedContainerTypeId).toBe(CONTAINER_TYPE.id);
    expect(handoff).toEqual({
        containerType: CONTAINER_TYPE,
        registration: REGISTRATION,
    });
});

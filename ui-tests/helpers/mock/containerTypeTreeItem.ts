/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ContainerType, ContainerTypeRegistration } from '../../../src/models/schemas';
import type { IChildrenProvidingTreeItem } from '../../../src/views/treeview/development/IDataProvidingTreeItem';
import { mockModuleFor } from './moduleStub';

export class StubOwningAppTreeItem {
    public contextValue = 'spe:owningAppTreeItem';
    public label = 'Owning application';
    public constructor(public readonly containerType: ContainerType, public readonly parent: IChildrenProvidingTreeItem) { }
}

export class StubLocalRegistrationTreeItem {
    public contextValue = 'spe:localRegistrationTreeItem';
    public label = 'Local registration';
    public constructor(
        public readonly containerType: ContainerType,
        public readonly registration: ContainerTypeRegistration,
        public readonly billingInvalid: boolean
    ) { }
}

// Workers can reuse the cached ContainerTypeTreeItem across specs. Install the same stand-ins
// before loading it in either suite so the child constructors don't depend on load order.
export function stubContainerTypeTreeItemDependencies(): void {
    const parent = 'development/ContainerTypeTreeItem.ts';
    mockModuleFor(parent, 'OwningAppTreeItem', { OwningAppTreeItem: StubOwningAppTreeItem });
    mockModuleFor(parent, 'LocalRegistrationTreeItem', { LocalRegistrationTreeItem: StubLocalRegistrationTreeItem });
    mockModuleFor(parent, 'utils/Logger', { Logger: { log: () => undefined } });
    mockModuleFor(parent, 'BillingDecorationProvider', {
        blockBillingInvalid: () => undefined,
        tintBillingInvalid: () => undefined,
    });
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StorageProvider } from "../services/StorageProvider";
import { AppPermissionsListKey, ContainerTypeListKey } from "../utils/constants";
import { ApplicationPermissions } from "./ApplicationPermissions";

// Class that represents a Container Type Registration object persisted in the global storage provider

export class ContainerTypeRegistration {
    // instance properties
    public readonly id: string;
    public readonly containerTypeId: string;
    public readonly tenantId: string;
    public readonly applicationPermissions: ApplicationPermissions[];

    public constructor(containerTypeId: string, tenantId: string, applicationPermissions: ApplicationPermissions[]) {
       this.id = containerTypeId + '_' + tenantId;
       this.containerTypeId = containerTypeId;
       this.tenantId = tenantId;
       this.applicationPermissions = applicationPermissions;
    }

    public static loadFromStorage(key: string): ContainerTypeRegistration | undefined {
        return StorageProvider.get().global.getValue<ContainerTypeRegistration>(key);
    }

    public async saveToStorage(containerTypeId: string, tenantId: string): Promise<void> {
        StorageProvider.get().global.setValue(containerTypeId + '_' + tenantId, this);
    }

}
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
        const registrationString: string = StorageProvider.get().global.getValue(key);
        if (registrationString) {
            const registration = JSON.parse(registrationString);
            return new ContainerTypeRegistration(registration.containerTypeId, registration.tenantId, registration.applicationPermissions)
        }
        return undefined;
    }

    public async saveToStorage(): Promise<void> {
        const registration = {
            containerTypeId: this.containerTypeId,
            tenantId: this.tenantId,
            applicationPermissions: this.applicationPermissions
        }
        const registrationString = JSON.stringify(registration)
        await StorageProvider.get().global.setValue(this.containerTypeId + '_' + this.tenantId, registrationString);
    }
}
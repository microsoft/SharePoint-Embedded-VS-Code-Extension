/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContainerTypeRegistration } from "./ContainerTypeRegistration";

export class Container implements IContainerProperties {
    // instance properties
    public readonly id: string;
    public get containerTypeId(): string {
        return this.registration.containerTypeId;
    }
    public readonly displayName: string;
    public readonly description?: string | undefined;
    public readonly status?: string | undefined;
    public readonly itemMajorVersionLimit?: number | undefined;
    public readonly isItemVersioningEnabled?: boolean | undefined;
    public readonly storageUsedInBytes?: number | undefined;
    public readonly createdDateTime?: string | undefined;
    public readonly customProperties?: IContainerCustomProperties | undefined;
    public readonly permissions?: IContainerPermission[] | undefined;

    public constructor(public readonly registration: ContainerTypeRegistration, properties: IContainerProperties) {
        this.id = properties.id;
        this.displayName = properties.displayName;
        this.description = properties.description || '';
        this.status = properties.status;
        this.itemMajorVersionLimit = properties.itemMajorVersionLimit;
        this.isItemVersioningEnabled = properties.isItemVersioningEnabled;
        this.storageUsedInBytes = properties.storageUsedInBytes;
        this.createdDateTime = properties.createdDateTime;
        this.customProperties = properties.customProperties;
        this.permissions = properties.permissions;
    }

}

export interface IContainerProperties {
    id: string;
    containerTypeId: string;
    displayName: string;
    description?: string;
    status?: string;
    itemMajorVersionLimit?: number;
    isItemVersioningEnabled?: boolean;
    storageUsedInBytes?: number;
    createdDateTime?: string;
    customProperties?: IContainerCustomProperties;
    permissions?: IContainerPermission[];
}

export interface IContainerCustomProperties {
    [key: string]: {
        value: string;
        isSearchable: boolean;
    }
}

export interface IContainerPermission {
    id: string;
    roles: ContainerPermissionRoles[];
    grantedToV2: {
        user: {
            displayName?: string;
            email?: string;
            userPrincipalName: string;
        }
    }
}

export type ContainerPermissionRoles = 'reader' | 'writer' | 'manager' | 'owner';


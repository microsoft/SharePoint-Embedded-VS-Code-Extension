/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StorageProvider } from "../services/StorageProvider";
import { AppPermissionsListKey, ContainerTypeListKey } from "../utils/constants";

// Class that represents a FileStorageContainerType permissions object persisted in the global storage provider

export class ApplicationPermissions {
    // instance properties
    public readonly appId: string;
    public readonly delegated: string[];
    public readonly appOnly: string[];

    public constructor(appId: string, delegated: string[], appOnly: string[]) {
        this.appId = appId;
        this.delegated = delegated;
        this.appOnly = appOnly;
    }

    public static loadFromStorage(containerTypeId: string): ApplicationPermissions[] | undefined {
        const appPermissionsDict: { [key: string]: ApplicationPermissions[] } = StorageProvider.get().global.getValue(AppPermissionsListKey) || {};
        const appPermissions = appPermissionsDict[containerTypeId];
        if (appPermissions)
            return appPermissions;
        return undefined;
    }

    public async saveToStorage(containerTypeId: string): Promise<void> {
        const appPermissionsDict: any = StorageProvider.get().global.getValue(AppPermissionsListKey) || {};
        if (appPermissionsDict.hasOwnProperty(containerTypeId)) {
            appPermissionsDict[containerTypeId].push(this);
          } else {
            appPermissionsDict[containerTypeId] = [this];
          }
        StorageProvider.get().global.setValue(AppPermissionsListKey, appPermissionsDict);
    }

}
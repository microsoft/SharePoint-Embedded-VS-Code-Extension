/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { acquireAppOnlyCertSPOToken } from "../cert";
import ThirdPartyAuthProvider from "../services/3PAuthProvider";
import GraphProvider from "../services/GraphProvider";
import PnPProvider from "../services/PnPProvider";
import { StorageProvider } from "../services/StorageProvider";
import VroomProvider from "../services/VroomProvider";
import { AppPermissionsListKey, ContainerTypeListKey, CurrentApplicationKey, OwningAppIdKey, RegisteredContainerTypeSetKey, TenantIdKey } from "../utils/constants";
import { App } from "./App";
import { ApplicationPermissions } from "./ApplicationPermissions";
import { ContainerTypeRegistration } from "./ContainerTypeRegistration";

// Class that represents a Container Type object persisted in the global storage provider
export class ContainerType {
    // instance properties
    public readonly containerTypeId: string;
    public readonly owningAppId: string;
    public readonly billingClassification: number;
    public readonly azureSubscriptionId?: string;
    public readonly creationDate?: string;
    public readonly expiryDate?: string;
    public readonly isBillingProfileRequired?: boolean;
    public owningApp!: App;
    public secondaryApps: App[];
    public registrations: ContainerTypeRegistration[];

    public constructor(containerTypeId: string, owningAppId: string, owningApp: App, billingClassification: number, azureSubscriptionId?: string, creationDate?: string, expiryDate?: string, isBillingProfileRequired?: boolean) {
        this.azureSubscriptionId = azureSubscriptionId;
        this.owningAppId = owningAppId;
        this.billingClassification = billingClassification;
        this.containerTypeId = containerTypeId;
        this.creationDate = creationDate;
        this.expiryDate = expiryDate;
        this.owningApp = owningApp;
        this.secondaryApps = [];
        this.registrations = [];
    }

    public async register(owningAppId: string, guestAppId: string): Promise<boolean> {
        try {
            // Use Owning App Context for registration
            if (owningAppId !== guestAppId) {
                guestAppId = owningAppId;
            }
            const tid: any = StorageProvider.get().global.getValue(TenantIdKey);
            const appSecretsString = await StorageProvider.get().secrets.get(guestAppId);
            if (!appSecretsString) {
                return false;
            }
            const appSecrets = JSON.parse(appSecretsString);
            const thirdPartyAuthProvider = new ThirdPartyAuthProvider(guestAppId, appSecrets.thumbprint, appSecrets.privateKey)

            const accessToken = await thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/Organization.Read.All", "00000003-0000-0000-c000-000000000000/Application.ReadWrite.All"]);

            const tenantDomain = await GraphProvider.getOwningTenantDomain(accessToken);
            const parts = tenantDomain.split('.');
            const domain = parts[0];

            const certThumbprint = await GraphProvider.getCertThumbprintFromApplication(accessToken, guestAppId);
            const vroomAccessToken = appSecrets.privateKey && await acquireAppOnlyCertSPOToken(certThumbprint, owningAppId, domain, appSecrets.privateKey, tid)


            const containerTypeRegistration = ContainerTypeRegistration.loadFromStorage(`${this.containerTypeId}_${tid}`)!;
            await VroomProvider.registerContainerType(vroomAccessToken, guestAppId, `https://${domain}.sharepoint.com`, this.containerTypeId, containerTypeRegistration.applicationPermissions);
            
            // Update registration flag on ContainerType 
            const containerType = ContainerType.loadFromStorage(this.containerTypeId)!;
            containerType.saveToStorage();
            //vscode.window.showInformationMessage(`Successfully registered ContainerType ${containerTypeDict[owningAppId].ContainerTypeId} on 3P application: ${this.globalStorageManager.getValue(CurrentApplicationKey)}`);
            return true;
        } catch (error: any) {
            //vscode.window.showErrorMessage('Failed to register ContainerType');
            console.error('Error:', error.response);

            // TODO
            // remove registered app id from global storage?
            // remove application that failed registration from global storage?

            return false;
        }
    
    }

    public static loadFromStorage(containerTypeId: string): ContainerType | undefined {
        const containerType: any = StorageProvider.get().global.getValue<ContainerType>(containerTypeId);
        if (containerType)
            return containerType;
        return undefined;
    }

    public saveToStorage(): void {
        StorageProvider.get().global.setValue(this.containerTypeId, this);
    }

    public static loadAllContainerTypesFromStorage(): { [key: string]: any } | {} {
        return StorageProvider.get().global.getValue(ContainerTypeListKey) || {};
    }
}
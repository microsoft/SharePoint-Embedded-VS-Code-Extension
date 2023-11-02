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
import { ApplicationPermissions } from "./ApplicationPermissions";

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


    private constructor(containerTypeId: string, owningAppId: string, billingClassification: number, azureSubscriptionId?: string, creationDate?: string, expiryDate?: string, isBillingProfileRequired?: boolean) {
        this.azureSubscriptionId = azureSubscriptionId;
        this.owningAppId = owningAppId;
        this.billingClassification = billingClassification;
        this.containerTypeId = containerTypeId;
        this.creationDate = creationDate;
        this.expiryDate = expiryDate;
        this.isBillingProfileRequired = isBillingProfileRequired;
    }

    public static async create(appId: string, containerTypeName: string) {
        const appSecretsString = await StorageProvider.get().secrets.get(appId);
        if (!appSecretsString) {
            return;
        }
        const appSecrets = JSON.parse(appSecretsString);
        const thirdPartyAuthProvider = new ThirdPartyAuthProvider(appId, appSecrets.thumbprint, appSecrets.privateKey)

        const consentToken = await thirdPartyAuthProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);
        const graphAccessToken = await thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/Organization.Read.All", "00000003-0000-0000-c000-000000000000/Application.ReadWrite.All"]);
        const tenantDomain = await GraphProvider.getOwningTenantDomain(graphAccessToken);
        const parts = tenantDomain.split('.');
        const domain = parts[0];

        const spToken = await thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/.default`]);

        const containerTypeDict: { [key: string]: any } = ContainerType.loadAllContainerTypesFromStorage();
        const appPermissions = new ApplicationPermissions(appId, ["full"], ["full"]);

        // Create ContainerType if none exist in global store, else register application on existing ContainerType
        if (Object.keys(containerTypeDict).length !== 0) {
            // Currently, we support only 1 trial ContainerType per tenant, so we extract the first item in the permissions dictionary
            const owningAppId: string = StorageProvider.get().global.getValue(OwningAppIdKey);
            const containerTypeId = containerTypeDict[owningAppId].ContainerTypeId;
            appPermissions.saveToStorage(containerTypeId);

            //vscode.window.showInformationMessage(`Registering App ${thirdPartyAppId} on ContainerType ${containerTypeDict[thirdPartyAppId]}`);
            return true;
        } else {
            const containerTypeDetails = await PnPProvider.createNewContainerType(spToken, domain, appId, containerTypeName);
            const containerType = new ContainerType(containerTypeDetails.ContainerTypeId, 
                containerTypeDetails.OwningAppId, 
                containerTypeDetails.SPContainerTypeBillingClassification, 
                containerTypeDetails.AzureSubscriptionId,
                containerTypeDetails.CreationDate,
                containerTypeDetails.ExpiryDate,
                containerTypeDetails.isBillingProfileRequired);

            containerType.saveToStorage();
            appPermissions.saveToStorage(containerType.containerTypeId);

            StorageProvider.get().global.setValue(OwningAppIdKey, appId);
            //vscode.window.showInformationMessage(`ContainerType ${containerTypeDetails.ContainerTypeId} created successfully`);
            return true
        }
    }

    public static async registerContainerType(owningAppId: string, guestAppId: string): Promise<boolean> {
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
            const containerTypeDict: { [key: string]: any } = ContainerType.loadAllContainerTypesFromStorage();
            const containerTypeId = containerTypeDict[owningAppId].ContainerTypeId;
            const appPermissions = ApplicationPermissions.loadFromStorage(containerTypeId)
            await VroomProvider.registerContainerType(vroomAccessToken, guestAppId, `https://${domain}.sharepoint.com`, containerTypeId, appPermissions!);
            this.saveRegisteredContainerTypeIdToStorage(containerTypeId)
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

    public static loadContainerTypeFromStorage(clientId: string): ContainerType | undefined {
        const containerTypeDictionary: any = StorageProvider.get().global.getValue(ContainerTypeListKey) || {};
        const containerType = containerTypeDictionary[clientId];
        if (containerType)
            return containerType;
        return undefined;
    }

    public static loadAllContainerTypesFromStorage(): { [key: string]: any } | {} {
        return StorageProvider.get().global.getValue(ContainerTypeListKey) || {};
    }

    public static loadRegisteredContainerTypesFromStorage(): string[] {
        return StorageProvider.get().global.getValue(RegisteredContainerTypeSetKey) || [];
    }

    public static saveRegisteredContainerTypeIdToStorage(containerTypeId: string): void {
        const ids = this.loadRegisteredContainerTypesFromStorage();
        ids.push(containerTypeId);
        StorageProvider.get().global.setValue(RegisteredContainerTypeSetKey, ids);
    }

    public saveToStorage(): void {
        const containerTypeDictionary: any = ContainerType.loadAllContainerTypesFromStorage();
        containerTypeDictionary[this.owningAppId] = this;
        StorageProvider.get().global.setValue(ContainerTypeListKey, containerTypeDictionary);
    }

}
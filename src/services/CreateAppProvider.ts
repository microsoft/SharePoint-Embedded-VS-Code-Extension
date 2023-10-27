/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AppPermissionsListKey, ContainerTypeListKey, CurrentApplicationKey, OwningAppIdKey, RegisteredContainerTypeSetKey, TenantIdKey, ThirdPartyAppListKey, clientId } from '../utils/constants';
import FirstPartyAuthProvider from './1PAuthProvider';
import GraphServiceProvider from './GraphProvider';
import ThirdPartyAuthProvider from './3PAuthProvider';
import PnPProvider from './PnPProvider';
import VroomProvider from './VroomProvider';
import { generateCertificateAndPrivateKey, createCertKeyCredential, acquireAppOnlyCertSPOToken } from '../cert';
import { ext } from '../utils/extensionVariables';
import { LocalStorageService } from './StorageProvider';
import { ApplicationPermissions } from '../utils/models';

export class CreateAppProvider {
    private static instance: CreateAppProvider;
    // Create service providers
    public thirdPartyAuthProvider: ThirdPartyAuthProvider | undefined;
    public firstPartyAppAuthProvider = new FirstPartyAuthProvider(clientId, "1P");
    public graphProvider = new GraphServiceProvider();
    public pnpProvider = new PnPProvider();
    public vroomProvider = new VroomProvider();

    //Initialize storage models
    private workspaceStorageManager: LocalStorageService;
    public globalStorageManager: LocalStorageService;

    constructor(context: vscode.ExtensionContext) {
        this.workspaceStorageManager = new LocalStorageService(context.workspaceState);
        this.globalStorageManager = new LocalStorageService(context.globalState);
    }

    public static getInstance(context: vscode.ExtensionContext) {
        if (!CreateAppProvider.instance) {
            CreateAppProvider.instance = new CreateAppProvider(context);
        }
        return CreateAppProvider.instance;
    }

    async createAadApplication(applicationName: string): Promise<[boolean, string]> {
        try {
            const accessToken = await this.firstPartyAppAuthProvider.getToken(['Application.ReadWrite.All']);
            const { certificatePEM, privateKey, thumbprint } = generateCertificateAndPrivateKey();

            const certKeyCredential = createCertKeyCredential(certificatePEM);
            const applicationProps = await this.graphProvider.createAadApplication(applicationName, accessToken, certKeyCredential);

            const appDict: { [key: string]: any } = this.globalStorageManager.getValue(ThirdPartyAppListKey) || {};
            appDict[applicationProps.appId] = applicationProps;

            this.globalStorageManager.setValue(ThirdPartyAppListKey, appDict);
            this.globalStorageManager.setValue(CurrentApplicationKey, applicationProps.appId);

            //serialize secrets
            const secrets = {
                thumbprint: thumbprint,
                privateKey: privateKey,
                certificatePEM: certificatePEM
            }
            const serializedSecrets = JSON.stringify(secrets);
            await ext.context.secrets.store(applicationProps.appId, serializedSecrets);

            this.thirdPartyAuthProvider = new ThirdPartyAuthProvider(applicationProps.appId, thumbprint, privateKey);
            return [true, applicationProps.appId];
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
            return [false, ""];
        }
    }

    async createContainerType(appId: string, containerTypeName: string): Promise<boolean> {
        try {
            const thirdPartyAppId: any = appId;
            if (typeof this.thirdPartyAuthProvider == "undefined" || this.thirdPartyAuthProvider == null) {
                const serializedSecrets = await this.getSecretsByAppId(thirdPartyAppId);
                this.thirdPartyAuthProvider = new ThirdPartyAuthProvider(thirdPartyAppId, serializedSecrets.thumbprint, serializedSecrets.privateKey)
            }

            const consentToken = await this.thirdPartyAuthProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);
            const graphAccessToken = await this.thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/Organization.Read.All", "00000003-0000-0000-c000-000000000000/Application.ReadWrite.All"]);

            const passwordCredential: any = await this.graphProvider.addPasswordWithRetry(graphAccessToken, thirdPartyAppId);
            await this.graphProvider.addIdentifierUri(graphAccessToken, thirdPartyAppId);

            let secrets = await this.getSecretsByAppId(thirdPartyAppId);
            secrets.clientSecret = passwordCredential.secretText;
            await ext.context.secrets.store(thirdPartyAppId, JSON.stringify(secrets));

            const tenantDomain = await this.graphProvider.getOwningTenantDomain(graphAccessToken);
            const parts = tenantDomain.split('.');
            const domain = parts[0];

            const spToken = await this.thirdPartyAuthProvider.getToken([`https://${domain}-admin.sharepoint.com/.default`]);

            const containerTypeDict: { [key: string]: any } = this.globalStorageManager.getValue(ContainerTypeListKey) || {};
            const appPermissionsDict: { [key: string]: ApplicationPermissions[] } = this.globalStorageManager.getValue(AppPermissionsListKey) || {};

            // Create ContainerType if none exist in global store, else register application on existing ContainerType
            if (Object.keys(containerTypeDict).length !== 0) { 
                // Currently, we support only 1 trial ContainerType per tenant, so we extract the first item in the permissions dictionary
                const owningAppId: string = this.globalStorageManager.getValue(OwningAppIdKey);
                const containerTypeId = containerTypeDict[owningAppId].ContainerTypeId
                appPermissionsDict[containerTypeId].push({
                    appId: thirdPartyAppId,
                    delegated: ["full"],
                    appOnly: ["full"]
                });

                this.globalStorageManager.setValue(AppPermissionsListKey, appPermissionsDict);
                vscode.window.showInformationMessage(`Registering App ${thirdPartyAppId} on ContainerType ${containerTypeDict[thirdPartyAppId]}`);
                return true;
            } else {
                const containerTypeDetails = await this.pnpProvider.createNewContainerType(spToken, domain, thirdPartyAppId, containerTypeName);
                containerTypeDict[thirdPartyAppId] = containerTypeDetails;
                appPermissionsDict[containerTypeDetails.ContainerTypeId] = [{
                    appId: thirdPartyAppId,
                    delegated: ["full"],
                    appOnly: ["full"]
                }];
                this.globalStorageManager.setValue(ContainerTypeListKey, containerTypeDict);
                this.globalStorageManager.setValue(AppPermissionsListKey, appPermissionsDict);
                this.globalStorageManager.setValue(OwningAppIdKey, thirdPartyAppId);
                vscode.window.showInformationMessage(`ContainerType ${containerTypeDetails.ContainerTypeId} created successfully`);
                return true
            }
        } catch (error: any) {
            console.error('Error:', error);
            vscode.window.showErrorMessage(error.response && error.response.data && error.response.data && error.response.data.error.message);
            vscode.window.showErrorMessage(error.message);
            return false;
        }
    }

    async registerContainerType(owningAppId: string, guestAppId: string): Promise<boolean> {
        try {
            // Use Owning App Context for registration
            if (owningAppId !== guestAppId) {
                guestAppId = owningAppId;
            }
            const tid: any = this.globalStorageManager.getValue(TenantIdKey);
            const secrets = await this.getSecretsByAppId(guestAppId);
            const thirdPartyAuthProvider = new ThirdPartyAuthProvider(guestAppId, secrets.thumbprint, secrets.privateKey)

            const accessToken = await thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/Organization.Read.All", "00000003-0000-0000-c000-000000000000/Application.ReadWrite.All"]);

            const tenantDomain = await this.graphProvider.getOwningTenantDomain(accessToken);
            const parts = tenantDomain.split('.');
            const domain = parts[0];

            const certThumbprint = await this.graphProvider.getCertThumbprintFromApplication(accessToken, guestAppId);
            const vroomAccessToken = secrets.privateKey && await acquireAppOnlyCertSPOToken(certThumbprint, guestAppId, domain, secrets.privateKey, tid)
            const containerTypeDict: { [key: string]: any } = this.globalStorageManager.getValue(ContainerTypeListKey);
            const appPermissionsDict: { [key: string]: ApplicationPermissions[] } = this.globalStorageManager.getValue(AppPermissionsListKey);
            const containerTypeId = containerTypeDict[owningAppId].ContainerTypeId;
            await this.vroomProvider.registerContainerType(vroomAccessToken, guestAppId, `https://${domain}.sharepoint.com`, containerTypeId, appPermissionsDict[containerTypeId]);
            let registeredContainerTypes: string[] = this.globalStorageManager.getValue(RegisteredContainerTypeSetKey) || [];
            registeredContainerTypes.push(containerTypeId);
            this.globalStorageManager.setValue(RegisteredContainerTypeSetKey, registeredContainerTypes);
            vscode.window.showInformationMessage(`Successfully registered ContainerType ${containerTypeDict[owningAppId].ContainerTypeId} on 3P application: ${this.globalStorageManager.getValue(CurrentApplicationKey)}`);
            return true;
        } catch (error: any) {
            vscode.window.showErrorMessage('Failed to register ContainerType');
            console.error('Error:', error.response);

            // TODO
            // remove registered app id from global storage?
            // remove application that failed registration from global storage?

            return false;
        }
    }

    async getSecretsByAppId(thirdPartyAppId: string) {
        const serializedSecrets = await ext.context.secrets.get(thirdPartyAppId);
        if (serializedSecrets) {
            try {
                const secrets = JSON.parse(serializedSecrets);
                return secrets;
            } catch (error) {
                console.error(`Error parsing appId ${thirdPartyAppId} secrets: ${error}`);
            }
        } else {
            console.error('JSON string is undefined');
        }
        return null;
    };
}
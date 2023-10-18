/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { clientId } from '../utils/constants';
import FirstPartyAuthProvider from './1PAuthProvider';
import GraphServiceProvider from './GraphProvider';
import ThirdPartyAuthProvider from './3PAuthProvider';
import PnPProvider from './PnPProvider';
import VroomProvider from './VroomProvider';
import { generateCertificateAndPrivateKey, createCertKeyCredential, acquireAppOnlyCertSPOToken } from '../cert';
import { ext } from '../utils/extensionVariables';
import { LocalStorageService } from './StorageProvider';

export class CreateAppProvider {
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

    async createAadApplication(applicationName: string): Promise<[boolean, string]> {
        try {
            const accessToken = await this.firstPartyAppAuthProvider.getToken(['Application.ReadWrite.All']);
            const { certificatePEM, privateKey, thumbprint } = generateCertificateAndPrivateKey();

            const certKeyCredential = createCertKeyCredential(certificatePEM);
            const applicationProps = await this.graphProvider.createAadApplication(applicationName, accessToken, certKeyCredential);

            const appDict: { [key: string]: any } = this.globalStorageManager.getValue("3PAppList") || {};
            appDict[applicationProps.appId] = applicationProps;

            this.globalStorageManager.setValue("3PAppList", appDict);
            this.globalStorageManager.setValue("CurrentApplication", applicationProps.appId);

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

    async createContainerType(): Promise<boolean> {
        try {
            const thirdPartyAppId: any = this.globalStorageManager.getValue("CurrentApplication");
            if (typeof this.thirdPartyAuthProvider == "undefined" || this.thirdPartyAuthProvider == null) {
                const serializedSecrets = await this.getSecretsByAppId(thirdPartyAppId);                
                this.thirdPartyAuthProvider = new ThirdPartyAuthProvider(thirdPartyAppId, serializedSecrets.certificatePEM, serializedSecrets.privateKey)
            }

            const accessToken = await this.firstPartyAppAuthProvider.getToken(['Application.ReadWrite.All']);
            await this.graphProvider.getApplicationById(accessToken, thirdPartyAppId)

            const consentToken = await this.thirdPartyAuthProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);
            //const consentToken = await this.thirdPartyAuthProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);

            //const graphAccessToken = await thirdPartyAuthProvider.getOBOGraphToken(consentToken, ['Organization.Read.All']);

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

            const containerTypeDetails = await this.pnpProvider.createNewContainerType(spToken, domain, thirdPartyAppId)
            const containerTypeDict: { [key: string]: any } = this.globalStorageManager.getValue("ContainerTypeList") || {};
            containerTypeDict[thirdPartyAppId] = containerTypeDetails;
            this.globalStorageManager.setValue("ContainerTypeList", containerTypeDict);
            vscode.window.showInformationMessage(`ContainerType created successfully: ${containerTypeDetails.ContainerTypeId}`);
            return true
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
            return false;
        }
    }

    async registerContainerType(): Promise<boolean> {
        try {
            const thirdPartyAppId: any = this.globalStorageManager.getValue("CurrentApplication");
            const tid: any = this.globalStorageManager.getValue("tid");
            const secrets = await this.getSecretsByAppId(thirdPartyAppId);                
            if (typeof this.thirdPartyAuthProvider == "undefined" || this.thirdPartyAuthProvider == null) {
                this.thirdPartyAuthProvider = new ThirdPartyAuthProvider(thirdPartyAppId, secrets.certificatePEM, secrets.privateKey)
            }

            const accessToken = await this.thirdPartyAuthProvider.getToken(['https://graph.microsoft.com/.default']);

            const tenantDomain = await this.graphProvider.getOwningTenantDomain(accessToken);
            const parts = tenantDomain.split('.');
            const domain = parts[0];

            const certThumbprint = await this.graphProvider.getCertThumbprintFromApplication(accessToken, thirdPartyAppId);
            const vroomAccessToken = secrets.privateKey && await acquireAppOnlyCertSPOToken(certThumbprint, thirdPartyAppId, domain, secrets.privateKey, tid)
            const containerTypeDict: { [key: string]: any } = this.globalStorageManager.getValue("ContainerTypeList");
            await this.vroomProvider.registerContainerType(vroomAccessToken, thirdPartyAppId, `https://${domain}.sharepoint.com`, containerTypeDict[thirdPartyAppId].ContainerTypeId)
            vscode.window.showInformationMessage(`Successfully registered ContainerType ${containerTypeDict[thirdPartyAppId].ContainerTypeId} on 3P application: ${thirdPartyAppId}`);
            return true;
        } catch (error: any) {
            vscode.window.showErrorMessage('Failed to register ContainerType');
            console.error('Error:', error.response);
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
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
    private thirdPartyAuthProvider: ThirdPartyAuthProvider | undefined;
    private firstPartyAppAuthProvider = new FirstPartyAuthProvider(clientId, "1P");
    private graphProvider = new GraphServiceProvider();
    private pnpProvider = new PnPProvider();
    private vroomProvider = new VroomProvider();

    //Initialize storage models
    private workspaceStorageManager: LocalStorageService;
    public globalStorageManager: LocalStorageService;

    constructor(context: vscode.ExtensionContext) {
        this.workspaceStorageManager = new LocalStorageService(context.workspaceState);
        this.globalStorageManager = new LocalStorageService(context.globalState);
    }

    async createAadApplication(applicationName: string): Promise<boolean> {
        try {
            const accessToken = await this.firstPartyAppAuthProvider.getToken(['Application.ReadWrite.All']);
            const { certificatePEM, privateKey, thumbprint } = generateCertificateAndPrivateKey();

            const certKeyCredential = createCertKeyCredential(certificatePEM);
            const applicationProps = await this.graphProvider.createAadApplication(applicationName, accessToken, certKeyCredential);

            

            this.globalStorageManager.setValue("NewApplication", applicationProps);
            
            await ext.context.secrets.store("3PAppThumbprint", thumbprint);
            await ext.context.secrets.store("3PAppPrivateKey", privateKey);
            await ext.context.secrets.store("3PAppCert", certificatePEM);

            this.thirdPartyAuthProvider = new ThirdPartyAuthProvider(applicationProps["appId"], "3P", thumbprint, privateKey)
            vscode.window.showInformationMessage(`Successfully created 3P application: ${applicationProps["appId"]}`);
            return true;
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
            return false;
        }
    }

    async createContainerType(): Promise<boolean> {
        try {
            const thirdPartyAppDetails: any = this.globalStorageManager.getValue("NewApplication");
            if (typeof this.thirdPartyAuthProvider == "undefined" || this.thirdPartyAuthProvider == null) {
                const pk: any = await ext.context.secrets.get("3PAppPrivateKey");
                const thumbprint: any = await ext.context.secrets.get("3PAppThumbprint");
                this.thirdPartyAuthProvider = new ThirdPartyAuthProvider(thirdPartyAppDetails["appId"],"3P", thumbprint, pk)
            }

            const accessToken = await this.firstPartyAppAuthProvider.getToken(['Application.ReadWrite.All']);
            await this.graphProvider.getApplicationById(accessToken, thirdPartyAppDetails["appId"])

            const consentToken = await this.thirdPartyAuthProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);

            //const graphAccessToken = await thirdPartyAuthProvider.getOBOGraphToken(consentToken, ['Organization.Read.All']);

            const graphAccessToken = await this.thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/Organization.Read.All", "00000003-0000-0000-c000-000000000000/Application.ReadWrite.All"]);

            const passwordCredential: any = await this.graphProvider.addPassword(graphAccessToken, thirdPartyAppDetails["appId"]);
            await ext.context.secrets.store("3PAppSecret", passwordCredential.secretText)

            const tenantDomain = await this.graphProvider.getOwningTenantDomain(graphAccessToken);
            const parts = tenantDomain.split('.');
            const domain = parts[0];

            //const accessToken = await thirdPartyAuthProvider.getAppToken(`https://${domain}-admin.sharepoint.com/.default`);

            const containerTypeDetails = await this.pnpProvider.createNewContainerType(consentToken, domain, thirdPartyAppDetails["appId"])
            this.globalStorageManager.setValue("ContainerTypeDetails", containerTypeDetails);
            vscode.window.showInformationMessage(`ContainerType created successfully: ${containerTypeDetails}`);
            return true
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
            return false;
        }
    }

    async registerContainerType(): Promise<boolean> {
        try {
            const thirdPartyAppDetails: any = this.globalStorageManager.getValue("NewApplication");
            if (typeof this.thirdPartyAuthProvider == "undefined" || this.thirdPartyAuthProvider == null) {
                const pk: any = await ext.context.secrets.get("3PAppPrivateKey");
                const thumbprint: any = await ext.context.secrets.get("3PAppThumbprint");
                this.thirdPartyAuthProvider = new ThirdPartyAuthProvider(thirdPartyAppDetails["appId"], "3P", thumbprint, pk)
            }

            const accessToken = await this.thirdPartyAuthProvider.getToken(['https://graph.microsoft.com/.default']);

            const tenantDomain = await this.graphProvider.getOwningTenantDomain(accessToken);
            const parts = tenantDomain.split('.');
            const domain = parts[0];

            const pk: string | undefined = await ext.context.secrets.get("3PAppPrivateKey");

            const certThumbprint = await this.graphProvider.getCertThumbprintFromApplication(accessToken, thirdPartyAppDetails["appId"]);
            const vroomAccessToken = pk && await acquireAppOnlyCertSPOToken(certThumbprint, thirdPartyAppDetails["appId"], domain, pk)
            const containerTypeDetails: any = this.globalStorageManager.getValue("ContainerTypeDetails");
            this.vroomProvider.registerContainerType(vroomAccessToken, thirdPartyAppDetails["appId"], `https://${domain}.sharepoint.com`, containerTypeDetails['ContainerTypeId'])
            vscode.window.showInformationMessage(`Successfully registered ContainerType ${containerTypeDetails['ContainerTypeId']} on 3P application: ${thirdPartyAppDetails["appId"]}`);
            return true;
        } catch (error: any) {
            vscode.window.showErrorMessage('Failed to register ContainerType');
            console.error('Error:', error.response);
            return false;
        }
    }
}
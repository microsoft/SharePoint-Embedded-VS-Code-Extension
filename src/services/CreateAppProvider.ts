import * as vscode from 'vscode';
import { clientId, consumingTenantId } from '../utils/constants';
import FirstPartyAuthProvider from './1PAuthProvider';
import GraphServiceProvider from './GraphProvider';
import ThirdPartyAuthProvider from './3PAuthProvider';
import PnPProvider from './PnPProvider';
import VroomProvider from './VroomProvider';
import { generateCertificateAndPrivateKey, createKeyCredential } from '../cert';
import { ext } from '../utils/extensionVariables';
import { LocalStorageService } from './StorageProvider';
import { showAccessTokenWebview } from '../extension';

export class CreateAppProvider {
// Create service providers
private thirdPartyAuthProvider: ThirdPartyAuthProvider | undefined;
private firstPartyAppAuthProvider = new FirstPartyAuthProvider(clientId, consumingTenantId, "1P");
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

async createAadApplication(applicationName: string) {
    try {
        const accessToken = await this.firstPartyAppAuthProvider.getToken(['Application.ReadWrite.All']);
        const { certificatePEM, privateKey, thumbprint } = generateCertificateAndPrivateKey();

        const keyCredential = createKeyCredential(certificatePEM);
        const applicationProps = await this.graphProvider.createAadApplication(applicationName, accessToken, keyCredential);

        this.globalStorageManager.setValue("NewApplication", applicationProps);
        await ext.context.secrets.store("3PAppThumbprint", thumbprint);
        await ext.context.secrets.store("3PAppPrivateKey", privateKey);
        await ext.context.secrets.store("3PAppCert", certificatePEM);

        this.thirdPartyAuthProvider = new ThirdPartyAuthProvider(applicationProps["appId"], consumingTenantId, "3P", thumbprint, privateKey)
        vscode.window.showInformationMessage(`Successfully created 3P application: ${applicationProps["appId"]}`);
    } catch (error) {
        vscode.window.showErrorMessage('Failed to obtain access token.');
        console.error('Error:', error);
    }
}

async createContainerType() {
        try {
        const thirdPartyAppDetails: any = this.globalStorageManager.getValue("NewApplication");
        if (typeof this.thirdPartyAuthProvider == "undefined" || this.thirdPartyAuthProvider == null) {
            const pk: any = await ext.context.secrets.get("3PAppPrivateKey");
            const thumbprint: any = await ext.context.secrets.get("3PAppThumbprint");
            this.thirdPartyAuthProvider = new ThirdPartyAuthProvider(thirdPartyAppDetails["appId"], consumingTenantId, "3P", thumbprint, pk)
        }
        
        const consentToken = await this.thirdPartyAuthProvider.getToken(['00000003-0000-0ff1-ce00-000000000000/.default']);

        //const graphAccessToken = await thirdPartyAuthProvider.getOBOGraphToken(consentToken, ['Organization.Read.All']);

        const graphAccessToken = await this.thirdPartyAuthProvider.getToken(["00000003-0000-0000-c000-000000000000/Organization.Read.All"]);
        
        const tenantDomain = await this.graphProvider.getOwningTenantDomain(graphAccessToken);
        const parts = tenantDomain.split('.');
        const domain = parts[0];

        //const accessToken = await thirdPartyAuthProvider.getAppToken(`https://${domain}-admin.sharepoint.com/.default`);

        const containerTypeDetails = await this.pnpProvider.createNewContainerType(consentToken, domain, thirdPartyAppDetails["appId"])
        this.globalStorageManager.setValue("ContainerTypeDetails", containerTypeDetails);
        vscode.window.showInformationMessage(`ContainerType created successfully: ${containerTypeDetails}`);
    } catch (error) {
        vscode.window.showErrorMessage('Failed to obtain access token.');
        console.error('Error:', error);
    }
}
}
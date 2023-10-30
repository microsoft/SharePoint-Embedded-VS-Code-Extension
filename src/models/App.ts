
import { createCertKeyCredential, generateCertificateAndPrivateKey } from "../cert";
import GraphProvider from "../services/GraphProvider";
import { StorageProvider } from "../services/StorageProvider";

// Class that represents an Azure AD application object persisted in the global storage provider
export class App {
    private static readonly storage = StorageProvider.get();
    private static readonly graph = new GraphProvider();

    // instance properties
    public readonly clientId: string;
    public readonly displayName: string;
    public readonly objectId: string;
    public readonly tenantId: string;
    private clientSecret?: string;
    private thumbprint?: string;
    private privateKey?: string;

    private constructor(clientId: string, displayName: string, objectId: string, tenantId: string, clientSecret?: string, thumbprint?: string, privateKey?: string) {
        this.clientId = clientId;
        this.displayName = displayName;
        this.objectId = objectId;
        this.tenantId = tenantId;
        this.clientSecret = clientSecret;
        this.thumbprint = thumbprint;
        this.privateKey = privateKey;
    }

    public static async create(displayName: string, token: string): Promise<App | undefined> {
        const { certificatePEM, privateKey, thumbprint } = generateCertificateAndPrivateKey();
        const certKeyCredential = createCertKeyCredential(certificatePEM);
        const properties = await App.graph.createAadApplication(displayName, token, certKeyCredential);
        if (properties) {
            const app = new App(properties.appId, displayName, properties.id, properties.tenantId, undefined, thumbprint, privateKey);
            app.saveToStorage();
            app.addAppSecretWithDelay(token, 20 * 1000);
            return app;
        }
        return undefined;
    }

    public async createContainerType(token: string): Promise<void> {
        //await App.graph.createContainerType(token, this.clientId);
    }

    private async addAppSecretWithDelay(token: string, delay: number): Promise<void> {
        return new Promise((resolve, reject) => {
            setTimeout(async () => {
                try {
                    await this.addAppSecret(token);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }, delay);
        });
    }

    private async addAppSecret(token: string): Promise<void> {
        const passwordCredential: any = await App.graph.addPasswordWithRetry(token, this.clientId);
        if (passwordCredential && passwordCredential.secretText) {
            await App.graph.addIdentifierUri(token, this.clientId);
            this.clientSecret = passwordCredential.secretText;
            await this.saveToStorage();
        }
    }

    public static async loadFromStorage(clientId: string): Promise<App | undefined> {
        const app = App.storage.global.getValue<App>(clientId);
        if (app) {
            const appSecretsString = await App.storage.secrets.get(clientId);
            if (appSecretsString) {
                const appSecrets = JSON.parse(appSecretsString);
                app.clientSecret = appSecrets.clientSecret;
                app.thumbprint = appSecrets.thumbprint;
                app.privateKey = appSecrets.privateKey;
            }
            return app;
        }
        return undefined;
    }

    public async saveToStorage(): Promise<void> {
        App.storage.global.setValue(this.clientId, this);
        const appSecrets = {
            clientSecret: this.clientSecret,
            thumbprint: this.thumbprint,
            privateKey: this.privateKey
        };
        await App.storage.secrets.store(this.clientId, JSON.stringify(appSecrets));
    }

 }
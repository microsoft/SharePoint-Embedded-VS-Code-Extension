
import * as Graph from '@microsoft/microsoft-graph-client';
import { Application } from "@microsoft/microsoft-graph-types";
import { BaseAuthProvider } from './BaseAuthProvider';

export class GraphProviderNew {
    private static readonly _scopes = ['Application.ReadWrite.All', 'User.Read', 'Sites.Read.All'];

    private _client: Graph.Client;

    public constructor(private _authProvider: BaseAuthProvider) {
        this._client = Graph.Client.init({
            authProvider: _authProvider.getAuthHandler(GraphProviderNew._scopes)
        });
    }

    public async getRootSiteUrl(): Promise<string> {
        const response = await this._client
            .api('/sites/root')
            .get();
        return response.webUrl;
    }

    public async getSpUrls(): Promise<{ root: string, admin: string }> {
        const rootSiteUrl = await this.getRootSiteUrl();
        const domainElements = rootSiteUrl.split('.');
        domainElements[0] += '-admin';
        const spAdminUrl = domainElements.join('.');
        return {
            root: rootSiteUrl,
            admin: spAdminUrl
        };
    }

    public async listApps(): Promise<Application[]> {
        const response = await this._client
            .api('/applications')
            .get();
        return response.value as Application[];
    }

    public async searchApps(query: string = ''): Promise<Application[]> {
       let request = this._client
            .api('/applications')
            .select('id,appId,displayName,createdDateTime')
            .orderby('createdDateTime desc');
        if (query) {
            request = request.search(`displayName:${query} OR appId:${query}`);
        }
        const response = await request.get();
        return response.value as Application[];
    }

    public async getApp(appId: string): Promise<Application | undefined> {
        try {
            const response = await this._client
                .api(`/applications`)
                .filter(`appId eq '${appId}'`)
                .get();
            return response.value[0] as Application;
        } catch (error) {
            return undefined;
        }
    }

    /*
    public async listContainers(): Promise<IContainer[]> {
        const response = await this._client
            .api('/storage/fileStorage/containers')
            .version('beta')
            .filter(`containerTypeId eq ${this._containerTypeId}`)
            .get();
        return response.value as IContainer[];
    }

    public async createContainer(clientCreateRequest: IContainerClientCreateRequest): Promise<IContainer> {
        const createRequest: IContainerServerCreateRequest = {
            ...clientCreateRequest,
            containerTypeId: this._containerTypeId
        };
        const response = await this._client
            .api('/storage/fileStorage/containers')
            .version('beta')
            .post(createRequest);
        return response as IContainer;
    }

    public async getContainer(id: string, loadColumns: boolean = true): Promise<IContainer> {
        const query = { 
            $select: "id,displayName,containerTypeId,status,createdDateTime,description,customProperties,storageUsedInBytes,itemMajorVersionLimit,isItemVersioningEnabled",
            $expand: "permissions" 
        };
        const response = await this._client
            .api(`/storage/fileStorage/containers/${id}`)
            .query(query)
            .version('beta')
            .get();
        if (loadColumns) {
            response.columns = await this.getContainerColumns(id);
            console.log(response.columns);
        }
        return response as IContainer;
    }

    public async updateContainer(id: string, updateRequest: IContainerUpdateRequest): Promise<IContainer> {
        const response = await this._client
            .api(`/storage/fileStorage/containers/${id}`)
            .version('beta')
            .patch(updateRequest);
        return response as IContainer;
    }
    */
}


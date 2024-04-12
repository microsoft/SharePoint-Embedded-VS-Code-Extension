
import { Application } from "@microsoft/microsoft-graph-types";
import { GraphProviderNew } from "./GraphProviderNew";
import { App } from "../models/App";

export default class AppProvider {
    
    public constructor(private _graph: GraphProviderNew) {}

    public async search(query: string = ''): Promise<Application[]> {
        return this._graph.searchApps(query);
    }

    public async get(appId: string): Promise<App> {
        let app = await App.loadFromStorage(appId);
        if (!app) {
            const appProperties = await this._graph.getApp(appId);
            if (appProperties && appProperties.appId) {
                app = new App(
                    appProperties.appId, 
                    appProperties.displayName!,
                    appProperties.id!,
                );
            }
        }
        return app || new App(appId);
    }

}
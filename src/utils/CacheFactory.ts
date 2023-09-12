/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-ignore
import { ICacheClient, ICachePlugin, TokenCacheContext } from '@azure/msal-node';
import { ext } from './extensionVariables';

export class CachePluginFactory implements ICachePlugin {
    private namespace: string; 

    constructor(namespace: string) {
        this.namespace = namespace
    }

    public async beforeCacheAccess(cacheContext: TokenCacheContext): Promise<void> {
        const cachedValue: string | undefined = await ext.context.secrets.get(this.namespace);
        cachedValue && cacheContext.tokenCache.deserialize(cachedValue);
    }

    public async afterCacheAccess(cacheContext: TokenCacheContext): Promise<void> {
        if (cacheContext.cacheHasChanged) {
            await ext.context.secrets.store(this.namespace, cacheContext.tokenCache.serialize());
        }
    }
}


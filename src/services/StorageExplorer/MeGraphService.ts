/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Graph from '@microsoft/microsoft-graph-client';
import { CurrentUser } from './protocol';

/** Signed-in user profile lookup for the Storage Explorer, executed on the extension host. */
export class MeGraphService {
    public constructor(private readonly _client: Graph.Client) { }

    /**
     * Get the current sign-in user's profile.
     * Returns selected fields: id, displayName, mail, userPrincipalName.
     */
    public async get(): Promise<CurrentUser> {
        return this._client
            .api('/me')
            .version('v1.0')
            .select('id,displayName,mail,userPrincipalName')
            .get();
    }
}

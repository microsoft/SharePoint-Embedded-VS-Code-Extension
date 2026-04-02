import { Client } from '@microsoft/microsoft-graph-client';
import type { User } from '@microsoft/microsoft-graph-types';
import { WebviewAuthProvider } from '../WebviewAuthProvider';
import { withAuthRetry } from '../GraphClient';

export class MeGraphService {
    constructor(
        private readonly _client: Client,
        private readonly _authProvider: WebviewAuthProvider,
    ) {}

    /**
     * Get the current sign-in user's profile.
     * Returns selected fields: id, displayName, mail, userPrincipalName.
     */
    async get(): Promise<Pick<User, 'id' | 'displayName' | 'mail' | 'userPrincipalName'>> {
        return withAuthRetry(this._authProvider, () =>
            this._client
                .api('/me')
                .version('v1.0')
                .select('id,displayName,mail,userPrincipalName')
                .get(),
        );
    }
}

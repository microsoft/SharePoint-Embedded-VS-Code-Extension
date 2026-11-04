import { request } from '../rpc';
import type { CurrentUser } from '../protocol';

/** Signed-in user profile lookup, executed by the extension host. */
export class MeGraphService {
    /**
     * Get the current sign-in user's profile.
     * Returns selected fields: id, displayName, mail, userPrincipalName.
     */
    async get(): Promise<CurrentUser> {
        return request('me.get', {});
    }
}

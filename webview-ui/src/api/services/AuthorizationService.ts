import { request } from '../rpc';
import type { AuthorizationSnapshot } from '../protocol';

/** Reads operation-level authorization derived by the extension host. */
export class AuthorizationService {
    public get(): Promise<AuthorizationSnapshot> {
        return request('authorization.get', {});
    }
}

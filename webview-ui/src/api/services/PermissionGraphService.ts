import { Client } from '@microsoft/microsoft-graph-client';
import type { Permission } from '@microsoft/microsoft-graph-types';
import { withAuthRetry } from '../GraphClient';
import { WebviewAuthProvider } from '../WebviewAuthProvider';
import type { ContainerRole, PeopleSuggestion } from '../../models/spe';

export class PermissionGraphService {
    constructor(
        private readonly _client: Client,
        private readonly _authProvider: WebviewAuthProvider,
    ) {}

    // ── Drive item permissions ────────────────────────────────────────────────

    /** List sharing permissions on a drive item. */
    async listItemPermissions(driveId: string, itemId: string): Promise<Permission[]> {
        return withAuthRetry(this._authProvider, async () => {
            const result = await this._client
                .api(`/drives/${driveId}/items/${itemId}/permissions`)
                .get();
            return result.value ?? [];
        });
    }

    /** Create a sharing link for a drive item. */
    async createSharingLink(
        driveId: string,
        itemId: string,
        type: string,
        scope: string,
        expirationDate?: string,
        preventDownload?: boolean,
    ): Promise<Permission> {
        return withAuthRetry(this._authProvider, async () => {
            const body: Record<string, unknown> = { type, scope };
            if (expirationDate) body.expirationDateTime = new Date(expirationDate).toISOString();
            if (preventDownload) body.preventsDownload = true;
            return this._client
                .api(`/drives/${driveId}/items/${itemId}/createLink`)
                .post(body);
        });
    }

    /** Invite users to a drive item with a specific role. */
    async inviteToItem(
        driveId: string,
        itemId: string,
        emails: string[],
        role: string,
        requireSignIn: boolean,
        sendInvitation: boolean,
        expirationDate?: string,
    ): Promise<Permission[]> {
        return withAuthRetry(this._authProvider, async () => {
            const body: Record<string, unknown> = {
                requireSignIn,
                sendInvitation,
                roles: [role],
                recipients: emails.map(email => ({ email })),
            };
            if (expirationDate) body.expirationDateTime = new Date(expirationDate).toISOString();
            const result = await this._client
                .api(`/drives/${driveId}/items/${itemId}/invite`)
                .post(body);
            return result.value ?? result ?? [];
        });
    }

    /** Update a permission on a drive item. */
    async updateItemPermission(
        driveId: string,
        itemId: string,
        permissionId: string,
        patch: Partial<Permission>,
    ): Promise<Permission> {
        return withAuthRetry(this._authProvider, async () => {
            return this._client
                .api(`/drives/${driveId}/items/${itemId}/permissions/${permissionId}`)
                .patch(patch);
        });
    }

    /** Delete a permission from a drive item. */
    async deleteItemPermission(driveId: string, itemId: string, permissionId: string): Promise<void> {
        return withAuthRetry(this._authProvider, async () => {
            await this._client
                .api(`/drives/${driveId}/items/${itemId}/permissions/${permissionId}`)
                .delete();
        });
    }

    // ── Container permissions (roles) ─────────────────────────────────────────

    /** List all user/group role assignments in a container. */
    async listContainerPermissions(containerId: string): Promise<Permission[]> {
        return withAuthRetry(this._authProvider, async () => {
            const result = await this._client
                .api(`/storage/fileStorage/containers/${containerId}/permissions`)
                .get();
            return result.value ?? [];
        });
    }

    /**
     * Add a user or group to a container role.
     * Uses `grantedToV2.user` for users (identified by userPrincipalName) and
     * `grantedToV2.group` for groups (identified by object id).
     */
    async addContainerPermission(
        containerId: string,
        member: PeopleSuggestion,
        role: ContainerRole,
    ): Promise<Permission> {
        return withAuthRetry(this._authProvider, async () => {
            const grantedToV2 = member.kind === 'group'
                ? { group: { id: member.id } }
                : { user: { userPrincipalName: member.userPrincipalName ?? member.email } };

            const result = await this._client
                .api(`/storage/fileStorage/containers/${containerId}/permissions`)
                .post({ roles: [role], grantedToV2 });
            return result;
        });
    }

    /** Update a user's role within a container. */
    async updateContainerPermission(
        containerId: string,
        permissionId: string,
        role: ContainerRole,
    ): Promise<Permission> {
        return withAuthRetry(this._authProvider, async () => {
            const result = await this._client
                .api(`/storage/fileStorage/containers/${containerId}/permissions/${permissionId}`)
                .patch({ roles: [role] });
            return result;
        });
    }

    /** Remove a user or group from a container. */
    async deleteContainerPermission(containerId: string, permissionId: string): Promise<void> {
        return withAuthRetry(this._authProvider, async () => {
            await this._client
                .api(`/storage/fileStorage/containers/${containerId}/permissions/${permissionId}`)
                .delete();
        });
    }
}

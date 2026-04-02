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
    async listItemPermissions(_itemId: string): Promise<Permission[]> {
        throw new Error('PermissionGraphService.listItemPermissions: not yet implemented');
    }

    /** Create a sharing link for a drive item. */
    async createSharingLink(
        _itemId: string,
        _type: 'view' | 'edit',
        _scope: 'anonymous' | 'organization',
    ): Promise<Permission> {
        throw new Error('PermissionGraphService.createSharingLink: not yet implemented');
    }

    /** Invite users/groups to a drive item with a specific role. */
    async inviteToItem(
        _itemId: string,
        _emails: string[],
        _role: 'read' | 'write',
    ): Promise<Permission[]> {
        throw new Error('PermissionGraphService.inviteToItem: not yet implemented');
    }

    /** Update a permission role on a drive item. */
    async updateItemPermission(
        _itemId: string,
        _permissionId: string,
        _role: 'read' | 'write',
    ): Promise<Permission> {
        throw new Error('PermissionGraphService.updateItemPermission: not yet implemented');
    }

    /** Delete a permission from a drive item. */
    async deleteItemPermission(_itemId: string, _permissionId: string): Promise<void> {
        throw new Error('PermissionGraphService.deleteItemPermission: not yet implemented');
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

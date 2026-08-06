import type { Permission } from '@microsoft/microsoft-graph-types';
import { request } from '../rpc';
import type { ContainerRole, PeopleSuggestion } from '../protocol';

/** Drive item and SPE container permission operations, executed by the extension host. */
export class PermissionGraphService {
    // ── Drive item permissions ────────────────────────────────────────────────

    /** List sharing permissions on a drive item. */
    async listItemPermissions(driveId: string, itemId: string): Promise<Permission[]> {
        return request('permissions.listItemPermissions', { driveId, itemId });
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
        return request('permissions.createSharingLink', {
            driveId, itemId, type, scope, expirationDate, preventDownload,
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
        return request('permissions.inviteToItem', {
            driveId, itemId, emails, role, requireSignIn, sendInvitation, expirationDate,
        });
    }

    /** Update a permission on a drive item. */
    async updateItemPermission(
        driveId: string,
        itemId: string,
        permissionId: string,
        patch: Partial<Permission>,
    ): Promise<Permission> {
        return request('permissions.updateItemPermission', { driveId, itemId, permissionId, patch });
    }

    /** Delete a permission from a drive item. */
    async deleteItemPermission(driveId: string, itemId: string, permissionId: string): Promise<void> {
        return request('permissions.deleteItemPermission', { driveId, itemId, permissionId });
    }

    // ── Container permissions (roles) ─────────────────────────────────────────

    /** List all user/group role assignments in a container. */
    async listContainerPermissions(containerId: string): Promise<Permission[]> {
        return request('permissions.listContainerPermissions', { containerId });
    }

    /** Add a user or group to a container role. */
    async addContainerPermission(
        containerId: string,
        member: PeopleSuggestion,
        role: ContainerRole,
    ): Promise<Permission> {
        return request('permissions.addContainerPermission', { containerId, member, role });
    }

    /** Update a user's role within a container. */
    async updateContainerPermission(
        containerId: string,
        permissionId: string,
        role: ContainerRole,
    ): Promise<Permission> {
        return request('permissions.updateContainerPermission', { containerId, permissionId, role });
    }

    /** Remove a user or group from a container. */
    async deleteContainerPermission(containerId: string, permissionId: string): Promise<void> {
        return request('permissions.deleteContainerPermission', { containerId, permissionId });
    }
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Graph from '@microsoft/microsoft-graph-client';
import type { Permission } from '@microsoft/microsoft-graph-types';
import { ContainerRole, PeopleSuggestion } from './protocol';

/** Drive item and SPE container permission operations, executed on the extension host. */
export class PermissionGraphService {
    public constructor(private readonly _client: Graph.Client) { }

    // ── Drive item permissions ────────────────────────────────────────────────

    /** List sharing permissions on a drive item. */
    public async listItemPermissions(driveId: string, itemId: string): Promise<Permission[]> {
        const result = await this._client
            .api(`/drives/${driveId}/items/${itemId}/permissions`)
            .get();
        return result.value ?? [];
    }

    /** Create a sharing link for a drive item. */
    public async createSharingLink(
        driveId: string,
        itemId: string,
        type: string,
        scope: string,
        expirationDate?: string,
        preventDownload?: boolean
    ): Promise<Permission> {
        const body: Record<string, unknown> = { type, scope };
        if (expirationDate) { body.expirationDateTime = new Date(expirationDate).toISOString(); }
        if (preventDownload) { body.preventsDownload = true; }
        return this._client
            .api(`/drives/${driveId}/items/${itemId}/createLink`)
            .post(body);
    }

    /** Invite users to a drive item with a specific role. */
    public async inviteToItem(
        driveId: string,
        itemId: string,
        emails: string[],
        role: string,
        requireSignIn: boolean,
        sendInvitation: boolean,
        expirationDate?: string
    ): Promise<Permission[]> {
        const body: Record<string, unknown> = {
            requireSignIn,
            sendInvitation,
            roles: [role],
            recipients: emails.map(email => ({ email })),
        };
        if (expirationDate) { body.expirationDateTime = new Date(expirationDate).toISOString(); }
        const result = await this._client
            .api(`/drives/${driveId}/items/${itemId}/invite`)
            .post(body);
        return result.value ?? result ?? [];
    }

    /** Update a permission on a drive item. */
    public async updateItemPermission(
        driveId: string,
        itemId: string,
        permissionId: string,
        patch: Partial<Permission>
    ): Promise<Permission> {
        return this._client
            .api(`/drives/${driveId}/items/${itemId}/permissions/${permissionId}`)
            .patch(patch);
    }

    /** Delete a permission from a drive item. */
    public async deleteItemPermission(driveId: string, itemId: string, permissionId: string): Promise<void> {
        await this._client
            .api(`/drives/${driveId}/items/${itemId}/permissions/${permissionId}`)
            .delete();
    }

    // ── Container permissions (roles) ─────────────────────────────────────────

    /** List all user/group role assignments in a container. */
    public async listContainerPermissions(containerId: string): Promise<Permission[]> {
        const result = await this._client
            .api(`/storage/fileStorage/containers/${containerId}/permissions`)
            .get();
        return result.value ?? [];
    }

    /**
     * Add a user or group to a container role.
     * Uses `grantedToV2.user` for users (identified by userPrincipalName) and
     * `grantedToV2.group` for groups (identified by object id).
     */
    public async addContainerPermission(
        containerId: string,
        member: PeopleSuggestion,
        role: ContainerRole
    ): Promise<Permission> {
        const grantedToV2 = member.kind === 'group'
            ? { group: { id: member.id } }
            : { user: { userPrincipalName: member.userPrincipalName ?? member.email } };

        return this._client
            .api(`/storage/fileStorage/containers/${containerId}/permissions`)
            .post({ roles: [role], grantedToV2 });
    }

    /** Update a user's role within a container. */
    public async updateContainerPermission(
        containerId: string,
        permissionId: string,
        role: ContainerRole
    ): Promise<Permission> {
        return this._client
            .api(`/storage/fileStorage/containers/${containerId}/permissions/${permissionId}`)
            .patch({ roles: [role] });
    }

    /** Remove a user or group from a container. */
    public async deleteContainerPermission(containerId: string, permissionId: string): Promise<void> {
        await this._client
            .api(`/storage/fileStorage/containers/${containerId}/permissions/${permissionId}`)
            .delete();
    }
}

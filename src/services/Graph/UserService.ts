/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Graph from '@microsoft/microsoft-graph-client';
import * as vscode from 'vscode';
import { User, userSchema } from '../../models/schemas';
import { Logger } from '../../utils/Logger';
import { GraphAuthProvider } from '../Auth';
import { ext } from '../../utils/extensionVariables';

async function dumpGraphAccessToken(label: string): Promise<void> {
    try {
        const token = await GraphAuthProvider.getInstance().getToken([], false);
        const out = ext.outputChannel;
        if (out) {
            // Write in chunks so log-channel line-length limits don't truncate the middle of the token.
            out.info(`${label} — Graph access token (length=${token.length}):`);
            for (let i = 0; i < token.length; i += 500) {
                out.info(token.slice(i, i + 500));
            }
            out.info(`${label} — end of token`);
            out.show(true);
        }
        console.log(`${label} — Graph access token (length=${token.length}):`, token);
        // Auto-copy so you don't have to hand-select from the output panel.
        await vscode.env.clipboard.writeText(token);
    } catch (err) {
        console.error(`${label} — failed to acquire token for dump:`, err);
    }
}

async function offerCopyAccessTokenOnError(_error: unknown, callLabel: string): Promise<void> {
    try {
        const token = await GraphAuthProvider.getInstance().getToken([], false);
        const copy = vscode.l10n.t('Copy access token');
        const pick = await vscode.window.showErrorMessage(
            vscode.l10n.t('{0} failed. Copy the Graph access token to inspect on jwt.ms?', callLabel),
            copy
        );
        if (pick === copy) {
            await vscode.env.clipboard.writeText(token);
            vscode.window.showInformationMessage(vscode.l10n.t('Access token copied to clipboard.'));
        }
    } catch {
        // ignore — token acquisition failure is a separate problem
    }
}

/**
 * Service for querying tenant users via Microsoft Graph.
 * Uses v1.0 exclusively per extension policy.
 */
export class UserService {
    private static readonly API_VERSION = 'v1.0';
    private static readonly BASE_PATH = '/users';
    private static readonly DEFAULT_SELECT = [
        'id',
        'displayName',
        'userPrincipalName',
        'mail',
        'userType',
        'jobTitle'
    ];

    constructor(private _client: Graph.Client) {}

    /**
     * List tenant users. Members-only by default; pass `includeGuests: true`
     * to include B2B guests.
     */
    async list(options?: {
        top?: number;
        filter?: string;
        select?: string[];
        includeGuests?: boolean;
    }): Promise<User[]> {
        const selectFields = options?.select ?? UserService.DEFAULT_SELECT;
        const filter = options?.filter
            ?? (options?.includeGuests ? undefined : `userType eq 'Member'`);

        await dumpGraphAccessToken('[UserService.list] before GET /users');

        try {
            let request = this._client
                .api(UserService.BASE_PATH)
                .version(UserService.API_VERSION)
                .select(selectFields.join(','));

            if (filter) {
                request = request.filter(filter);
            }
            if (options?.top) {
                request = request.top(options.top);
            }

            const response = await request.get();
            return (response?.value ?? []).map((u: any) => userSchema.parse(u));
        } catch (error: any) {
            console.error('[UserService.list] Error listing users:', error);
            await offerCopyAccessTokenOnError(error, 'GET /users');
            throw new Error(`Failed to list users: ${error.message || error}`);
        }
    }

    /**
     * Search tenant users by display name, mail, or UPN.
     * Uses $search with ConsistencyLevel: eventual.
     * Members-only by default.
     */
    async search(query: string, options?: {
        top?: number;
        select?: string[];
        includeGuests?: boolean;
    }): Promise<User[]> {
        await dumpGraphAccessToken('[UserService.search] before GET /users?$search');
        try {
            const trimmed = query.trim();
            if (!trimmed) {
                return this.list({ top: options?.top, select: options?.select, includeGuests: options?.includeGuests });
            }

            const selectFields = options?.select ?? UserService.DEFAULT_SELECT;
            const searchClause = [
                `"displayName:${trimmed}"`,
                `"mail:${trimmed}"`,
                `"userPrincipalName:${trimmed}"`
            ].join(' OR ');

            let request = this._client
                .api(UserService.BASE_PATH)
                .version(UserService.API_VERSION)
                .header('ConsistencyLevel', 'eventual')
                .search(searchClause)
                .select(selectFields.join(','))
                .top(options?.top ?? 25);

            if (!options?.includeGuests) {
                request = request.filter(`userType eq 'Member'`);
            }

            const response = await request.get();
            return (response?.value ?? []).map((u: any) => userSchema.parse(u));
        } catch (error: any) {
            console.error(`[UserService.search] Error searching users for "${query}":`, error);
            await offerCopyAccessTokenOnError(error, `GET /users?$search="${query}"`);
            throw new Error(`Failed to search users: ${error.message || error}`);
        }
    }

    /**
     * Get a single user by id (UUID) or userPrincipalName.
     * Returns null on 404.
     */
    async get(idOrUpn: string, options?: { select?: string[] }): Promise<User | null> {
        try {
            const selectFields = options?.select ?? UserService.DEFAULT_SELECT;
            const response = await this._client
                .api(`${UserService.BASE_PATH}/${idOrUpn}`)
                .version(UserService.API_VERSION)
                .select(selectFields.join(','))
                .get();
            return userSchema.parse(response);
        } catch (error: any) {
            if (error.code === 'Request_ResourceNotFound' || error.code === 'NotFound' || error.statusCode === 404) {
                Logger.log(`[UserService.get] User not found: ${idOrUpn}`);
                return null;
            }
            console.error(`[UserService.get] Error getting user ${idOrUpn}:`, error);
            throw new Error(`Failed to get user ${idOrUpn}: ${error.message || error}`);
        }
    }
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ext } from '../../utils/extensionVariables';
import { Logger } from '../../utils/Logger';
import { Perf } from '../../utils/Perf';

export interface AuthHandler {
    (done: AuthHandlerCallback): void;
}

export interface AuthHandlerCallback {
    (err: any, token: string | null): void;
}

export interface VSCodeAuthConfig {
    clientId: string;
    scopes: string[];
    tenantId?: string;
}

/**
 * Flexible authentication provider that uses VS Code's built-in authentication API
 * with configurable client ID and scopes for different authentication scenarios.
 * https://github.com/microsoft/vscode/issues/115626
 */
export class VSCodeAuthProvider {
    private static readonly PROVIDER_ID = 'microsoft';
    private readonly _config: VSCodeAuthConfig;
    private readonly _fullScopes: string[];
    private _currentSession: vscode.AuthenticationSession | undefined;

    /**
     * Coalesces concurrent `getSession` calls for the same scope set. Loading the
     * development tree fires many Graph requests at once and each one asks the auth
     * handler for a token; without this they would each make a separate round-trip
     * to the Microsoft authentication provider.
     */
    private readonly _inFlight = new Map<string, Promise<string>>();

    constructor(config: VSCodeAuthConfig) {
        this._config = config;
        this._fullScopes = this._buildScopes();
    }

    /**
     * Build the VS Code scope list: the required `VSCODE_*` directives plus the
     * configured scopes and any extras.
     *
     * Scopes are de-duplicated because VS Code's Microsoft provider keys its session
     * cache on the exact scope set. A repeated scope produces a *different* key, which
     * misses the session established at start-up and forces a fresh token acquisition
     * against Entra ID on the first Graph call.
     */
    private _buildScopes(additionalScopes?: string[]): string[] {
        const scopes = [
            `VSCODE_CLIENT_ID:${this._config.clientId}`,
            this._config.tenantId ? `VSCODE_TENANT:${this._config.tenantId}` : 'VSCODE_TENANT:organizations',
            'offline_access',
            ...this._config.scopes,
            ...(additionalScopes ?? [])
        ];
        return [...new Set(scopes)];
    }

    /**
     * Get an authentication handler compatible with Microsoft Graph SDK
     */
    public getAuthHandler(additionalScopes?: string[]): AuthHandler {
        return (done: AuthHandlerCallback) => {
            // First try to get existing session, then create if needed
            this.getToken(additionalScopes, false)
                .catch(() => {
                    // If no existing session, try to create one
                    // This handles the case where AuthenticationState has signed in
                    // but this provider doesn't have a session yet
                    return this.getToken(additionalScopes, true);
                })
                .then(token => {
                    done(null, token);
                })
                .catch(err => done(err, null));
        };
    }

    /**
     * Get an access token for the specified scopes
     */
    public async getToken(additionalScopes?: string[], createIfNone: boolean = false, account?: vscode.AuthenticationSessionAccountInformation): Promise<string> {
        const scopes = additionalScopes?.length ? this._buildScopes(additionalScopes) : this._fullScopes;

        // Lock subsequent calls to whichever account VS Code picked first.
        // - First call: this._currentSession is undefined, so no account hint is sent.
        //   VS Code's auth provider picks any matching account by its own preference.
        // - Subsequent calls: pin to that same account so the session, the displayed
        //   user, and every downstream token stay consistent for the rest of the
        //   extension's lifetime
        const resolvedAccount = account ?? this._currentSession?.account;

        const key = `${createIfNone ? 'create' : 'silent'}|${resolvedAccount?.id ?? ''}|${scopes.join(' ')}`;
        const existing = this._inFlight.get(key);
        if (existing) {
            return existing;
        }

        const pending = this._acquireToken(scopes, createIfNone, resolvedAccount)
            .finally(() => this._inFlight.delete(key));
        this._inFlight.set(key, pending);
        return pending;
    }

    private async _acquireToken(
        scopes: string[],
        createIfNone: boolean,
        account: vscode.AuthenticationSessionAccountInformation | undefined
    ): Promise<string> {
        try {
            const session = await Perf.track('auth', `getSession (${createIfNone ? 'interactive' : 'silent'})`, () =>
                Promise.resolve(vscode.authentication.getSession(
                    VSCodeAuthProvider.PROVIDER_ID,
                    scopes,
                    { createIfNone, account }
                ))
            );

            if (session) {
                this._currentSession = session;
                return session.accessToken;
            }

            throw new Error('No authentication session available');
        } catch (error) {
            console.error('Failed to get authentication token:', error);
            throw error;
        }
    }

    /**
     * Return the access token from the most recently acquired session without
     * making any network call.  Returns undefined if no session has been
     * established yet in this provider instance.
     */
    public getCachedToken(): string | undefined {
        return this._currentSession?.accessToken;
    }

    /**
     * Sign in and create a new authentication session
     */
    public async signIn(additionalScopes?: string[], account?: vscode.AuthenticationSessionAccountInformation): Promise<vscode.AuthenticationSession> {
        try {
            const scopes = this._buildScopes(additionalScopes);

            const session = await Perf.track('auth', 'getSession (sign-in)', () =>
                Promise.resolve(vscode.authentication.getSession(
                    VSCodeAuthProvider.PROVIDER_ID,
                    scopes,
                    { createIfNone: true, clearSessionPreference: true, account }
                ))
            );
            
            if (!session) {
                throw new Error('Failed to create authentication session');
            }
            
            this._currentSession = session;
            return session;
        } catch (error) {
            console.error('Sign in failed:', error);
            throw error;
        }
    }

    /**
     * Sign out and remove the current authentication session
     */
    public async signOut(): Promise<void> {
        try {
            this._currentSession = undefined;
            // Note: VS Code's authentication API doesn't expose removeSession()
            // for consumer extensions. The session remains in VS Code's account
            // picker until the user manually signs out there.
        } catch (error) {
            console.error('Sign out failed:', error);
            throw error;
        }
    }

    /**
     * Get the current authentication session if available
     */
    public getCurrentSession(): vscode.AuthenticationSession | undefined {
        return this._currentSession;
    }

    /**
     * Check if there is a current authentication session
     */
    public isSignedIn(): boolean {
        return this._currentSession !== undefined;
    }

    /**
     * Get account information from the current session
     */
    public getAccountInfo(): { id: string; label: string } | undefined {
        if (this._currentSession) {
            return {
                id: this._currentSession.account.id,
                label: this._currentSession.account.label
            };
        }
        return undefined;
    }

    /**
     * Force refresh the current session by getting a new token
     */
    public async refreshSession(additionalScopes?: string[]): Promise<vscode.AuthenticationSession> {
        try {
            const scopes = this._buildScopes(additionalScopes);

            const session = await vscode.authentication.getSession(
                VSCodeAuthProvider.PROVIDER_ID,
                scopes,
                { 
                    createIfNone: false,
                    forceNewSession: true 
                }
            );
            
            if (!session) {
                throw new Error('Failed to refresh authentication session');
            }
            
            this._currentSession = session;
            return session;
        } catch (error) {
            console.error('Session refresh failed:', error);
            throw error;
        }
    }

    /**
     * Get the client ID used by this auth provider
     */
    public getClientId(): string {
        return this._config.clientId;
    }

    /**
     * Get the configured scopes for this auth provider
     */
    public getScopes(): string[] {
        return [...this._config.scopes];
    }
}
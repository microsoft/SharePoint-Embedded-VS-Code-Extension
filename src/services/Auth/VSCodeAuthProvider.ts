/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

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

    constructor(config: VSCodeAuthConfig) {
        this._config = config;
        
        // Build full scopes including VS Code specific prefixes
        this._fullScopes = [
            `VSCODE_CLIENT_ID:${config.clientId}`,
            config.tenantId ? `VSCODE_TENANT:${config.tenantId}` : 'VSCODE_TENANT:common',
            'offline_access',
            ...config.scopes
        ];
    }

    /**
     * Get an authentication handler compatible with Microsoft Graph SDK
     */
    public getAuthHandler(additionalScopes?: string[]): AuthHandler {
        const scopes = additionalScopes ? [...this._config.scopes, ...additionalScopes] : this._config.scopes;
        return (done: AuthHandlerCallback) => {
            // First try to get existing session, then create if needed
            this.getToken(scopes, false)
                .catch(() => {
                    // If no existing session, try to create one
                    // This handles the case where AuthenticationState has signed in
                    // but this provider doesn't have a session yet
                    return this.getToken(scopes, true);
                })
                .then(token => done(null, token))
                .catch(err => done(err, null));
        };
    }

    /**
     * Get an access token for the specified scopes
     */
    public async getToken(additionalScopes?: string[], createIfNone: boolean = false, account?: vscode.AuthenticationSessionAccountInformation): Promise<string> {
        try {
            const scopes = additionalScopes ? 
                [
                    `VSCODE_CLIENT_ID:${this._config.clientId}`,
                    this._config.tenantId ? `VSCODE_TENANT:${this._config.tenantId}` : 'VSCODE_TENANT:common',
                    'offline_access',
                    ...this._config.scopes,
                    ...additionalScopes
                ] : 
                this._fullScopes;

            const session = await vscode.authentication.getSession(
                VSCodeAuthProvider.PROVIDER_ID,
                scopes,
                { createIfNone, account }
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
     * Sign in and create a new authentication session
     */
    public async signIn(additionalScopes?: string[], account?: vscode.AuthenticationSessionAccountInformation): Promise<vscode.AuthenticationSession> {
        try {
            const scopes = additionalScopes ? 
                [
                    `VSCODE_CLIENT_ID:${this._config.clientId}`,
                    this._config.tenantId ? `VSCODE_TENANT:${this._config.tenantId}` : 'VSCODE_TENANT:common',
                    'offline_access',
                    ...this._config.scopes,
                    ...additionalScopes
                ] : 
                this._fullScopes;

            const session = await vscode.authentication.getSession(
                VSCodeAuthProvider.PROVIDER_ID,
                scopes,
                { createIfNone: true, account }
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
            if (this._currentSession) {
                // VS Code's authentication API doesn't have a direct signOut method
                // but we can clear our cached session
                this._currentSession = undefined;
                
                // Note: VS Code handles session cleanup automatically when extensions
                // are disposed or when users sign out through the UI
            }
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
            const scopes = additionalScopes ? 
                [
                    `VSCODE_CLIENT_ID:${this._config.clientId}`,
                    this._config.tenantId ? `VSCODE_TENANT:${this._config.tenantId}` : 'VSCODE_TENANT:common',
                    'offline_access',
                    ...this._config.scopes,
                    ...additionalScopes
                ] : 
                this._fullScopes;

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
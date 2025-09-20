/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GraphAuthProvider } from '../services/Auth';
import { checkJwtForAdminClaim, decodeJwt } from '../utils/token';

/**
 * Authentication state change events
 */
export interface AuthStateChangeEvent {
    isSignedIn: boolean;
    account?: AuthenticatedAccount;
}

/**
 * Authenticated account information
 */
export interface AuthenticatedAccount {
    id: string;
    username: string;
    name?: string;
    tenantId: string;
    isAdmin: boolean;
}

/**
 * Authentication state change listener
 */
export interface AuthStateChangeListener {
    onBeforeSignIn?(): void;
    onSignIn?(account: AuthenticatedAccount): void;
    onSignInFailed?(): void;
    onSignOut?(): void;
}

/**
 * Centralized authentication state manager using GraphAuthProvider
 */
export class AuthenticationState {
    private static _instance: AuthenticationState;
    private static readonly _listeners: AuthStateChangeListener[] = [];
    private static _currentAccount: AuthenticatedAccount | undefined;
    private static _isSigningIn: boolean = false;

    private constructor() {}

    /**
     * Get the singleton instance
     */
    public static getInstance(): AuthenticationState {
        if (!AuthenticationState._instance) {
            AuthenticationState._instance = new AuthenticationState();
        }
        return AuthenticationState._instance;
    }

    /**
     * Check if user is currently signed in by validating GraphAuthProvider session
     */
    public static async isSignedIn(): Promise<boolean> {
        try {
            const graphAuth = GraphAuthProvider.getInstance();
            const currentSession = graphAuth.getCurrentSession();
            
            if (currentSession) {
                return true;
            }
            
            // If no current session, try to get one silently (existing session)
            try {
                await graphAuth.getToken([], false);
                return true;
            } catch {
                // No existing session available
                return false;
            }
        } catch {
            return false;
        }
    }

    /**
     * Get current authenticated account information
     */
    public static async getCurrentAccount(): Promise<AuthenticatedAccount | undefined> {
        if (AuthenticationState._currentAccount) {
            return AuthenticationState._currentAccount;
        }

        try {
            const graphAuth = GraphAuthProvider.getInstance();
            const session = graphAuth.getCurrentSession();
            
            if (!session) {
                return undefined;
            }

            // Get additional account info from token
            const decodedToken = decodeJwt(session.accessToken);
            const isAdmin = checkJwtForAdminClaim(decodedToken);

            const account: AuthenticatedAccount = {
                id: session.account.id,
                username: session.account.label,
                name: decodedToken.name,
                tenantId: decodedToken.tid || 'unknown',
                isAdmin
            };

            AuthenticationState._currentAccount = account;
            return account;
        } catch (error) {
            console.error('Failed to get current account:', error);
            return undefined;
        }
    }

    /**
     * Sign in with the GraphAuthProvider
     */
    public static async signIn(): Promise<AuthenticatedAccount | undefined> {
        if (AuthenticationState._isSigningIn) {
            return undefined;
        }

        try {
            AuthenticationState._isSigningIn = true;
            AuthenticationState._notifyBeforeSignIn();

            const graphAuth = GraphAuthProvider.getInstance();
            const session = await graphAuth.signIn();

            if (!session) {
                throw new Error('Failed to create authentication session');
            }

            // Get additional account info from token
            const decodedToken = decodeJwt(session.accessToken);
            const isAdmin = checkJwtForAdminClaim(decodedToken);

            const account: AuthenticatedAccount = {
                id: session.account.id,
                username: session.account.label,
                name: decodedToken.name,
                tenantId: decodedToken.tid || 'unknown',
                isAdmin
            };

            AuthenticationState._currentAccount = account;
            AuthenticationState._notifySignIn(account);
            
            // Set VS Code context variables
            vscode.commands.executeCommand('setContext', 'spe:isLoggedIn', true);
            vscode.commands.executeCommand('setContext', 'spe:isAdmin', account.isAdmin);
            vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', false);

            return account;
        } catch (error) {
            console.error('Sign in failed:', error);
            AuthenticationState._notifySignInFailed();
            vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', false);
            throw error;
        } finally {
            AuthenticationState._isSigningIn = false;
        }
    }

    /**
     * Sign out
     */
    public static async signOut(): Promise<void> {
        try {
            const graphAuth = GraphAuthProvider.getInstance();
            await graphAuth.signOut();

            AuthenticationState._currentAccount = undefined;
            AuthenticationState._notifySignOut();

            // Clear VS Code context variables
            vscode.commands.executeCommand('setContext', 'spe:isLoggedIn', false);
            vscode.commands.executeCommand('setContext', 'spe:isAdmin', false);
            vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', false);

        } catch (error) {
            console.error('Sign out failed:', error);
            throw error;
        }
    }

    /**
     * Check if currently signing in
     */
    public static isSigningIn(): boolean {
        return AuthenticationState._isSigningIn;
    }

    /**
     * Subscribe to authentication state changes
     */
    public static subscribe(listener: AuthStateChangeListener): void {
        AuthenticationState._listeners.push(listener);
    }

    /**
     * Unsubscribe from authentication state changes
     */
    public static unsubscribe(listener: AuthStateChangeListener): void {
        const index = AuthenticationState._listeners.indexOf(listener);
        if (index > -1) {
            AuthenticationState._listeners.splice(index, 1);
        }
    }

    /**
     * Initialize authentication state (check if already signed in)
     */
    public static async initialize(): Promise<void> {
        try {
            const isSignedIn = await AuthenticationState.isSignedIn();
            if (isSignedIn) {
                const account = await AuthenticationState.getCurrentAccount();
                if (account) {
                    AuthenticationState._currentAccount = account;
                    vscode.commands.executeCommand('setContext', 'spe:isLoggedIn', true);
                    vscode.commands.executeCommand('setContext', 'spe:isAdmin', account.isAdmin);
                }
            }
        } catch (error) {
            console.error('Failed to initialize authentication state:', error);
        }
    }

    /**
     * Force refresh current account information
     */
    public static async refreshAccount(): Promise<AuthenticatedAccount | undefined> {
        AuthenticationState._currentAccount = undefined;
        return await AuthenticationState.getCurrentAccount();
    }

    // Notification methods
    private static _notifyBeforeSignIn(): void {
        vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', true);
        AuthenticationState._listeners.forEach(listener => {
            if (listener.onBeforeSignIn) {
                listener.onBeforeSignIn();
            }
        });
    }

    private static _notifySignIn(account: AuthenticatedAccount): void {
        AuthenticationState._listeners.forEach(listener => {
            if (listener.onSignIn) {
                listener.onSignIn(account);
            }
        });
    }

    private static _notifySignInFailed(): void {
        AuthenticationState._listeners.forEach(listener => {
            if (listener.onSignInFailed) {
                listener.onSignInFailed();
            }
        });
    }

    private static _notifySignOut(): void {
        AuthenticationState._listeners.forEach(listener => {
            if (listener.onSignOut) {
                listener.onSignOut();
            }
        });
    }
}
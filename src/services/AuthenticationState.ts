/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { checkJwtForAdminClaim, decodeJwt } from '../utils/token';
import { GraphAuthProvider } from './Auth';

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
    domain: string;
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
    private static _signInAbortController: AbortController | undefined;
    private static readonly _SIGN_IN_TIMEOUT_MS = 60_000;

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
     * Get current authenticated account information (synchronous)
     * Returns cached account if available, undefined otherwise
     * Use getCurrentAccount() for async version that will fetch if needed
     */
    public static getCurrentAccountSync(): AuthenticatedAccount | undefined {
        return AuthenticationState._currentAccount;
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
                isAdmin,
                domain: AuthenticationState._extractDomain(session.account.label)
            };

            AuthenticationState._currentAccount = account;
            return account;
        } catch (error) {
            console.error('Failed to get current account:', error);
            return undefined;
        }
    }

    /**
     * Sign in with the GraphAuthProvider.
     * The sign-in can be cancelled via `cancelSignIn()` and will auto-timeout
     * after `_SIGN_IN_TIMEOUT_MS` milliseconds.
     */
    public static async signIn(): Promise<AuthenticatedAccount | undefined> {
        if (AuthenticationState._isSigningIn) {
            return undefined;
        }

        try {
            AuthenticationState._isSigningIn = true;
            AuthenticationState._signInAbortController = new AbortController();
            AuthenticationState._notifyBeforeSignIn();

            const graphAuth = GraphAuthProvider.getInstance();

            // Race the sign-in against cancellation and timeout
            const session = await AuthenticationState._raceWithAbort(
                graphAuth.signIn(),
                AuthenticationState._signInAbortController.signal,
                AuthenticationState._SIGN_IN_TIMEOUT_MS
            );

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
                isAdmin,
                domain: AuthenticationState._extractDomain(session.account.label)
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
            AuthenticationState._signInAbortController = undefined;
        }
    }

    /**
     * Cancel an in-flight sign-in operation.
     * Aborts the pending promise, resets internal state, and notifies listeners.
     */
    public static cancelSignIn(): void {
        if (AuthenticationState._signInAbortController) {
            AuthenticationState._signInAbortController.abort();
            AuthenticationState._signInAbortController = undefined;
        }
        AuthenticationState._isSigningIn = false;
        AuthenticationState._currentAccount = undefined;
        AuthenticationState._notifySignInFailed();
        vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', false);
        vscode.commands.executeCommand('setContext', 'spe:isLoggedIn', false);
    }

    /**
     * Race a promise against an AbortSignal and an optional timeout.
     * Rejects with an appropriate error if cancelled or timed out.
     */
    private static _raceWithAbort<T>(
        promise: Promise<T>,
        signal: AbortSignal,
        timeoutMs?: number
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            // Already aborted
            if (signal.aborted) {
                reject(new Error('Sign-in was cancelled'));
                return;
            }

            let timeoutId: ReturnType<typeof setTimeout> | undefined;

            const onAbort = () => {
                if (timeoutId) { clearTimeout(timeoutId); }
                reject(new Error('Sign-in was cancelled'));
            };
            signal.addEventListener('abort', onAbort, { once: true });

            if (timeoutMs) {
                timeoutId = setTimeout(() => {
                    signal.removeEventListener('abort', onAbort);
                    AuthenticationState.cancelSignIn();
                    vscode.window.showErrorMessage('Sign-in timed out. Please try again.');
                    reject(new Error('Sign-in timed out'));
                }, timeoutMs);
            }

            promise.then(
                (value) => {
                    if (timeoutId) { clearTimeout(timeoutId); }
                    signal.removeEventListener('abort', onAbort);
                    resolve(value);
                },
                (err) => {
                    if (timeoutId) { clearTimeout(timeoutId); }
                    signal.removeEventListener('abort', onAbort);
                    reject(err);
                }
            );
        });
    }

    /**
     * Sign in targeting a specific tenant.
     * Resets the auth provider to force tenant-scoped authentication,
     * then performs a normal sign-in flow.
     */
    public static async signInToTenant(tenantId: string): Promise<AuthenticatedAccount | undefined> {
        GraphAuthProvider.resetInstance();
        GraphAuthProvider.getInstance(tenantId);
        return await AuthenticationState.signIn();
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

    /**
     * Extract tenant domain from username email (e.g., user@contoso.onmicrosoft.com -> contoso)
     */
    private static _extractDomain(username: string): string {
        const atIndex = username.indexOf('@');
        if (atIndex === -1) return '';
        const fullDomain = username.substring(atIndex + 1);
        const dotIndex = fullDomain.indexOf('.');
        if (dotIndex !== -1) {
            return fullDomain.substring(0, dotIndex);
        }
        return fullDomain;
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { VSCodeAuthProvider, VSCodeAuthConfig } from '../services/Auth';

/**
 * Test utility to verify VS Code authentication integration
 */
export class AuthTestHelper {
    /**
     * Test basic authentication flow
     */
    public static async testAuthFlow(): Promise<boolean> {
        try {
            const config: VSCodeAuthConfig = {
                clientId: 'test-client-id',
                scopes: [
                    'https://graph.microsoft.com/User.Read',
                    'https://graph.microsoft.com/Application.ReadWrite.All'
                ]
            };
            const authProvider = new VSCodeAuthProvider(config);
            
            // Test sign in
            console.log('Testing VS Code authentication...');
            const scopes = [
                'https://graph.microsoft.com/User.Read',
                'https://graph.microsoft.com/Application.ReadWrite.All'
            ];
            
            const session = await authProvider.signIn(scopes);
            if (!session) {
                throw new Error('Failed to get authentication session');
            }
            
            console.log('Authentication successful!');
            console.log('User:', session.account.label);
            console.log('Session ID:', session.id);
            
            // Test token retrieval
            const token = await authProvider.getToken(scopes);
            if (!token) {
                throw new Error('Failed to get access token');
            }
            
            console.log('Token retrieved successfully');
            
            // Test auth handler for Graph SDK
            const authHandler = authProvider.getAuthHandler(scopes);
            const tokenPromise = new Promise<string>((resolve, reject) => {
                authHandler((err, token) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(token || '');
                    }
                });
            });
            
            const handlerToken = await tokenPromise;
            if (!handlerToken) {
                throw new Error('Auth handler failed to provide token');
            }
            
            console.log('Auth handler working correctly');
            
            return true;
        } catch (error) {
            console.error('Authentication test failed:', error);
            vscode.window.showErrorMessage(`Authentication test failed: ${error}`);
            return false;
        }
    }
    
    /**
     * Test sign out flow
     */
    public static async testSignOut(): Promise<boolean> {
        try {
            const config: VSCodeAuthConfig = {
                clientId: 'test-client-id',
                scopes: ['https://graph.microsoft.com/User.Read']
            };
            const authProvider = new VSCodeAuthProvider(config);
            await authProvider.signOut();
            
            const isSignedIn = authProvider.isSignedIn();
            if (isSignedIn) {
                throw new Error('User should be signed out but appears to still be signed in');
            }
            
            console.log('Sign out successful');
            return true;
        } catch (error) {
            console.error('Sign out test failed:', error);
            vscode.window.showErrorMessage(`Sign out test failed: ${error}`);
            return false;
        }
    }
}
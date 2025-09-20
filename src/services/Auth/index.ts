/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Base authentication provider
export { VSCodeAuthProvider, VSCodeAuthConfig, AuthHandler, AuthHandlerCallback } from './VSCodeAuthProvider';

// Specialized authentication providers
export { GraphAuthProvider } from './GraphAuthProvider';
export { ARMAuthProvider } from './ARMAuthProvider';

// Factory for application-specific authentication
export { AppAuthProviderFactory } from './AppAuthProviderFactory';
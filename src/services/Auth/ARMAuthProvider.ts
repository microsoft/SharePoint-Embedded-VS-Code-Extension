/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSCodeAuthProvider, VSCodeAuthConfig } from './VSCodeAuthProvider';
import { clientId } from '../../client';

/**
 * Authentication provider specifically configured for Azure Resource Manager (ARM) operations.
 * Used for managing Azure subscriptions, resource groups, and other ARM resources.
 */
export class ARMAuthProvider extends VSCodeAuthProvider {
    private static readonly ARM_SCOPES = [
        'https://management.azure.com/user_impersonation'
    ];

    private static _instance: ARMAuthProvider | undefined;

    constructor(tenantId?: string) {
        const config: VSCodeAuthConfig = {
            clientId,
            scopes: ARMAuthProvider.ARM_SCOPES,
            tenantId
        };
        super(config);
    }

    /**
     * Get or create the singleton instance of ARMAuthProvider
     */
    public static getInstance(tenantId?: string): ARMAuthProvider {
        if (!ARMAuthProvider._instance) {
            ARMAuthProvider._instance = new ARMAuthProvider(tenantId);
        }
        return ARMAuthProvider._instance;
    }

    /**
     * Reset the singleton instance (useful for testing or tenant changes)
     */
    public static resetInstance(): void {
        ARMAuthProvider._instance = undefined;
    }
}
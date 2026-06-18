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
        'https://management.azure.com/.default'
    ];

    private static _instance: ARMAuthProvider | undefined;
    private static _instanceTenantId: string | undefined;

    constructor(tenantId?: string) {
        const config: VSCodeAuthConfig = {
            clientId,
            scopes: ARMAuthProvider.ARM_SCOPES,
            tenantId
        };
        super(config);
    }

    /**
     * Get or create the singleton instance of ARMAuthProvider.
     * If tenantId changes, the instance is recreated so ARM tokens are never
     * acquired against a stale (previous) tenant after a tenant switch.
     */
    public static getInstance(tenantId?: string): ARMAuthProvider {
        if (ARMAuthProvider._instance && ARMAuthProvider._instanceTenantId !== tenantId) {
            ARMAuthProvider._instance = undefined;
        }

        if (!ARMAuthProvider._instance) {
            ARMAuthProvider._instance = new ARMAuthProvider(tenantId);
            ARMAuthProvider._instanceTenantId = tenantId;
        }
        return ARMAuthProvider._instance;
    }

    /**
     * Reset the singleton instance (useful for testing or tenant changes)
     */
    public static resetInstance(): void {
        ARMAuthProvider._instance = undefined;
        ARMAuthProvider._instanceTenantId = undefined;
    }
}
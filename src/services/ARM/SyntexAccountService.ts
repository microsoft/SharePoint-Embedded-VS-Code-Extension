/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { armRequest } from './armFetch';

const SYNTEX_ACCOUNTS_API_VERSION = '2023-01-04-preview';
const SYNTEX_NAMESPACE = 'Microsoft.Syntex';

export type SyntexProvisioningState =
    | 'Succeeded'
    | 'Failed'
    | 'Canceled'
    | 'Provisioning'
    | 'Updating'
    | 'Deleting'
    | 'Accepted';

export interface SyntexAccountProperties {
    friendlyName?: string;
    identityId?: string;
    identityType?: 'ContainerType' | 'Application' | 'User';
    provisioningState?: SyntexProvisioningState;
    feature?: string;
    scope?: string;
    service?: string;
}

export interface SyntexAccount {
    id: string;
    name: string;
    type?: string;
    location: string;
    properties: SyntexAccountProperties;
}

export interface SyntexAccountCreateInput {
    location: string;
    properties: {
        friendlyName: string;
        identityId: string;
        identityType: 'ContainerType';
        feature?: string;
        scope?: string;
        service?: string;
    };
}

/**
 * Manages Microsoft.Syntex/accounts resources — the billing entity that
 * links a container type to an Azure subscription.
 */
export class SyntexAccountService {
    /**
     * PUT /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Syntex/accounts/{name}
     *
     * Creates or updates a Syntex account. ARM returns 200/201 immediately
     * with `provisioningState` in a non-terminal state; use `waitForSucceeded`
     * to poll to completion.
     */
    async putAccount(
        subscriptionId: string,
        resourceGroupName: string,
        accountName: string,
        body: SyntexAccountCreateInput
    ): Promise<SyntexAccount> {
        return armRequest<SyntexAccount>({
            method: 'PUT',
            path: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/${SYNTEX_NAMESPACE}/accounts/${accountName}`,
            apiVersion: SYNTEX_ACCOUNTS_API_VERSION,
            body
        });
    }

    /**
     * GET /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Syntex/accounts/{name}
     */
    async getAccount(
        subscriptionId: string,
        resourceGroupName: string,
        accountName: string
    ): Promise<SyntexAccount> {
        return armRequest<SyntexAccount>({
            method: 'GET',
            path: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/${SYNTEX_NAMESPACE}/accounts/${accountName}`,
            apiVersion: SYNTEX_ACCOUNTS_API_VERSION
        });
    }

    /**
     * Poll `getAccount` until `properties.provisioningState === 'Succeeded'`
     * or a terminal failure state (Failed, Canceled) or timeout.
     */
    async waitForSucceeded(
        subscriptionId: string,
        resourceGroupName: string,
        accountName: string,
        options?: { timeoutMs?: number; pollIntervalMs?: number; onStateChange?: (state: SyntexProvisioningState | undefined) => void }
    ): Promise<SyntexAccount> {
        const timeoutMs = options?.timeoutMs ?? 300_000;
        const pollIntervalMs = options?.pollIntervalMs ?? 5_000;
        const deadline = Date.now() + timeoutMs;
        let lastState: SyntexProvisioningState | undefined;

        while (Date.now() < deadline) {
            const account = await this.getAccount(subscriptionId, resourceGroupName, accountName);
            const state = account.properties.provisioningState;
            if (state !== lastState) {
                lastState = state;
                options?.onStateChange?.(state);
            }
            if (state === 'Succeeded') { return account; }
            if (state === 'Failed' || state === 'Canceled') {
                throw new Error(`Syntex account provisioning ${state.toLowerCase()}.`);
            }
            await sleep(pollIntervalMs);
        }
        throw new Error(`Timed out waiting for Syntex account to provision (last state: ${lastState ?? 'unknown'})`);
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

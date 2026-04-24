/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { armRequest } from './armFetch';

const PROVIDERS_API_VERSION = '2021-04-01';
const SYNTEX_NAMESPACE = 'Microsoft.Syntex';

export type SyntexRegistrationState =
    | 'NotRegistered'
    | 'Registered'
    | 'Registering'
    | 'Unregistered'
    | 'Unregistering';

export interface SyntexProviderInfo {
    id: string;
    namespace: string;
    registrationState: SyntexRegistrationState;
}

/**
 * Manage registration of the Microsoft.Syntex resource provider on a
 * subscription. Syntex provisioning is a prerequisite for creating a paid
 * container type's billing account.
 */
export class SyntexProviderService {
    /**
     * GET /subscriptions/{id}/providers/Microsoft.Syntex
     */
    async get(subscriptionId: string): Promise<SyntexProviderInfo> {
        return armRequest<SyntexProviderInfo>({
            method: 'GET',
            path: `/subscriptions/${subscriptionId}/providers/${SYNTEX_NAMESPACE}`,
            apiVersion: PROVIDERS_API_VERSION
        });
    }

    /**
     * POST /subscriptions/{id}/providers/Microsoft.Syntex/register
     * Returns immediately with registrationState = 'Registering'.
     */
    async register(subscriptionId: string): Promise<SyntexProviderInfo> {
        return armRequest<SyntexProviderInfo>({
            method: 'POST',
            path: `/subscriptions/${subscriptionId}/providers/${SYNTEX_NAMESPACE}/register`,
            apiVersion: PROVIDERS_API_VERSION
        });
    }

    /**
     * Poll `get` until `registrationState === 'Registered'` or timeout.
     * Throws on timeout.
     */
    async waitForRegistered(
        subscriptionId: string,
        options?: { timeoutMs?: number; pollIntervalMs?: number; onStateChange?: (state: SyntexRegistrationState) => void }
    ): Promise<void> {
        const timeoutMs = options?.timeoutMs ?? 180_000;
        const pollIntervalMs = options?.pollIntervalMs ?? 5_000;
        const deadline = Date.now() + timeoutMs;
        let lastState: SyntexRegistrationState | undefined;

        while (Date.now() < deadline) {
            const info = await this.get(subscriptionId);
            if (info.registrationState !== lastState) {
                lastState = info.registrationState;
                options?.onStateChange?.(info.registrationState);
            }
            if (info.registrationState === 'Registered') {
                return;
            }
            await sleep(pollIntervalMs);
        }
        throw new Error(`Timed out waiting for Microsoft.Syntex to register (last state: ${lastState ?? 'unknown'})`);
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

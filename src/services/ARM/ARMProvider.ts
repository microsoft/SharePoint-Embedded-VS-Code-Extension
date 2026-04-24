/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SubscriptionService } from './SubscriptionService';
import { SyntexProviderService } from './SyntexProviderService';
import { SyntexAccountService } from './SyntexAccountService';

/**
 * Singleton provider for Azure Resource Manager operations. Mirrors
 * `GraphProvider`. Each service is a stateless wrapper over `armFetch`, so
 * the provider exists mostly for discoverability and consistency with the
 * Graph side.
 */
export class ARMProvider {
    private static _instance: ARMProvider | undefined;

    private readonly _subscriptions: SubscriptionService;
    private readonly _syntexProviders: SyntexProviderService;
    private readonly _syntexAccounts: SyntexAccountService;

    private constructor() {
        this._subscriptions = new SubscriptionService();
        this._syntexProviders = new SyntexProviderService();
        this._syntexAccounts = new SyntexAccountService();
    }

    public static getInstance(): ARMProvider {
        if (!ARMProvider._instance) {
            ARMProvider._instance = new ARMProvider();
        }
        return ARMProvider._instance;
    }

    public static resetInstance(): void {
        ARMProvider._instance = undefined;
    }

    public get subscriptions(): SubscriptionService {
        return this._subscriptions;
    }

    public get syntexProviders(): SyntexProviderService {
        return this._syntexProviders;
    }

    public get syntexAccounts(): SyntexAccountService {
        return this._syntexAccounts;
    }
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { armRequest } from './armFetch';

const SUBSCRIPTION_API_VERSION = '2021-04-01';
const RESOURCEGROUP_API_VERSION = '2021-04-01';
const PERMISSIONS_API_VERSION = '2022-04-01';

export interface ArmSubscriptionSummary {
    id: string;
    subscriptionId: string;
    displayName: string;
    state: string;
    tenantId?: string;
}

export interface ArmResourceGroupSummary {
    id: string;
    name: string;
    location: string;
}

interface ListResponse<T> {
    value: T[];
    nextLink?: string;
}

interface ArmPermission {
    actions?: string[];
    notActions?: string[];
    dataActions?: string[];
    notDataActions?: string[];
}

/**
 * ARM subscription operations: listing subscriptions, listing resource
 * groups, and verifying the caller has Owner/Contributor-equivalent access.
 */
export class SubscriptionService {
    /**
     * List all subscriptions the caller can see.
     * GET /subscriptions
     */
    async list(): Promise<ArmSubscriptionSummary[]> {
        const response = await armRequest<ListResponse<ArmSubscriptionSummary & Record<string, unknown>>>({
            method: 'GET',
            path: '/subscriptions',
            apiVersion: SUBSCRIPTION_API_VERSION
        });
        return (response.value ?? []).map(s => ({
            id: s.id,
            subscriptionId: s.subscriptionId,
            displayName: s.displayName ?? s.subscriptionId,
            state: s.state,
            tenantId: s.tenantId as string | undefined
        }));
    }

    /**
     * List resource groups in a subscription.
     * GET /subscriptions/{id}/resourceGroups
     */
    async listResourceGroups(subscriptionId: string): Promise<ArmResourceGroupSummary[]> {
        const response = await armRequest<ListResponse<ArmResourceGroupSummary & Record<string, unknown>>>({
            method: 'GET',
            path: `/subscriptions/${subscriptionId}/resourceGroups`,
            apiVersion: RESOURCEGROUP_API_VERSION
        });
        return (response.value ?? []).map(rg => ({
            id: rg.id,
            name: rg.name,
            location: rg.location
        }));
    }

    /**
     * Check whether the signed-in caller has subscription-level permissions
     * equivalent to Owner or Contributor by inspecting their effective
     * actions on the subscription. Any permission entry with `actions`
     * containing `*` (wildcard) is treated as sufficient.
     *
     * GET /subscriptions/{id}/providers/Microsoft.Authorization/permissions
     */
    async hasSubscriptionContributorAccess(subscriptionId: string): Promise<boolean> {
        const response = await armRequest<ListResponse<ArmPermission>>({
            method: 'GET',
            path: `/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/permissions`,
            apiVersion: PERMISSIONS_API_VERSION
        });
        const perms = response.value ?? [];
        for (const p of perms) {
            if (Array.isArray(p.actions) && p.actions.some(a => a === '*')) {
                return true;
            }
        }
        return false;
    }
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContainerType, ContainerTypeRegistration } from '../../../models/schemas';
import type { StorageExplorerReadiness } from '../../../services/StorageExplorer/protocol';

/**
 * True when billing has not been set up for a container type or its local registration.
 *
 * Trial container types carry no billing account, so their `billingStatus` is not a
 * meaningful signal; standard and direct-to-customer types are billed and are checked.
 * The registration is checked in every case, because a direct-to-customer type reports
 * per-tenant billing there.
 */
export function isBillingInvalid(
    containerType: ContainerType,
    registration: ContainerTypeRegistration | null
): boolean {
    const classification = containerType.billingClassification;
    const isBilled = classification === 'standard'
        || classification === 'directToCustomer'
        || classification === undefined;
    const containerTypeInvalid = isBilled && containerType.billingStatus !== 'valid';
    const registrationInvalid = !!registration && registration.billingStatus !== 'valid';
    return containerTypeInvalid || registrationInvalid;
}

/**
 * Whether Storage Explorer can operate on a container type, and if not, why.
 *
 * Shared by the tree row and by the post-setup hand-off so both agree on what "ready"
 * means: a hand-off that opened a panel the tree still shows as blocked (or the reverse)
 * would strand the user between two contradictory surfaces.
 *
 * Billing is checked first. Without it nothing under the container type works, so naming a
 * missing registration or grant would send the user down the wrong path.
 */
export function computeStorageExplorerReadiness(
    containerType: ContainerType,
    registration: ContainerTypeRegistration | null,
    hasExtensionPermissions: boolean
): StorageExplorerReadiness {
    if (isBillingInvalid(containerType, registration)) { return 'billingBlocked'; }
    if (!registration) { return 'unregistered'; }
    return hasExtensionPermissions ? 'ready' : 'missingPermissions';
}

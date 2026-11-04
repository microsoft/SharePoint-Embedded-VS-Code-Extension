/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const PENDING_CONTAINER_TTL_MS = 10 * 60 * 1000;

interface PendingCreatedContainer {
    tenantId: string;
    containerTypeId: string;
    containerId: string;
    expiresAt: number;
}

const pendingCreatedContainers = new Map<string, PendingCreatedContainer>();

function key(tenantId: string, containerTypeId: string, containerId: string): string {
    return JSON.stringify([tenantId, containerTypeId, containerId]);
}

function pruneExpired(now = Date.now()): void {
    for (const [entryKey, entry] of pendingCreatedContainers) {
        if (entry.expiresAt <= now) {
            pendingCreatedContainers.delete(entryKey);
        }
    }
}

export function recordPendingCreatedContainer(
    tenantId: string,
    containerTypeId: string,
    containerId: string
): void {
    pruneExpired();
    pendingCreatedContainers.set(key(tenantId, containerTypeId, containerId), {
        tenantId,
        containerTypeId,
        containerId,
        expiresAt: Date.now() + PENDING_CONTAINER_TTL_MS,
    });
}

export function getPendingCreatedContainerIds(tenantId: string, containerTypeId: string): string[] {
    pruneExpired();
    return [...pendingCreatedContainers.values()]
        .filter(entry => entry.tenantId === tenantId && entry.containerTypeId === containerTypeId)
        .map(entry => entry.containerId);
}

export function removePendingCreatedContainer(
    tenantId: string,
    containerTypeId: string,
    containerId: string
): void {
    pendingCreatedContainers.delete(key(tenantId, containerTypeId, containerId));
}

export function clearPendingCreatedContainers(): void {
    pendingCreatedContainers.clear();
}

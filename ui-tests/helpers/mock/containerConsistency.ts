/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Page, Route } from '@playwright/test';

export interface ConsistencyMockContainer {
    id: string;
    displayName: string;
    description: string | null;
    containerTypeId: string;
    createdDateTime: string;
    status: 'active' | 'inactive';
    lockState: string;
    assignedSensitivityLabel: null;
    drive: { id: string; quota: { used: number } };
}

export interface DelayedContainerCollection {
    started: Promise<void>;
    release: () => void;
}

interface PendingDelay extends DelayedContainerCollection {
    markStarted: () => void;
    released: Promise<void>;
}

interface FailureRule {
    method: string;
    path: RegExp;
    status: number;
}

const COLLECTION_PATH = /\/storage\/fileStorage\/containers$/;
const ITEM_PATH = /\/storage\/fileStorage\/containers\/([^/]+)$/;
const ACTIVATE_PATH = /\/storage\/fileStorage\/containers\/([^/]+)\/activate$/;
const DELETED_COLLECTION_PATH = /\/storage\/fileStorage\/deletedContainers$/;
const RESTORE_PATH = /\/storage\/fileStorage\/deletedContainers\/([^/]+)\/restore$/;

const seedContainer = (): ConsistencyMockContainer => ({
    id: 'b!container-seed',
    displayName: 'Seed Container',
    description: null,
    containerTypeId: 'ct-mock-00000000-0000-0000-0000-000000000000',
    createdDateTime: '2026-01-01T00:00:00.000Z',
    status: 'active',
    lockState: 'unlocked',
    assignedSensitivityLabel: null,
    drive: { id: 'b!container-seed', quota: { used: 0 } },
});

export class ContainerConsistencyMock {
    readonly containers: ConsistencyMockContainer[] = [];
    private readonly deletedContainers = new Map<string, ConsistencyMockContainer>();
    private readonly seed = seedContainer();
    private readonly releasedIds = new Set<string>();
    private readonly staleDeletedIds = new Set<string>();
    private readonly failures: FailureRule[] = [];
    private readonly collectionDelays: PendingDelay[] = [];
    private sequence = 0;

    freezeContainerCollection(): void {
        this.releasedIds.clear();
    }

    findContainer(id: string): ConsistencyMockContainer | undefined {
        return this.containers.find(container => container.id === id);
    }

    releaseContainer(id: string): void {
        if (!this.findContainer(id)) {
            throw new Error(`Unknown consistency-mock container: ${id}`);
        }
        this.releasedIds.add(id);
    }

    keepDeletedContainerInCollection(id: string): void {
        if (!this.findContainer(id)) {
            throw new Error(`Unknown consistency-mock container: ${id}`);
        }
        this.staleDeletedIds.add(id);
    }

    completeContainerDeletion(id: string): void {
        const container = this.findContainer(id);
        if (container) {
            this.containers.splice(this.containers.indexOf(container), 1);
        }
        this.releasedIds.delete(id);
        this.staleDeletedIds.delete(id);
    }

    failNextRequest(method: string, path: RegExp, status = 500): void {
        this.failures.push({ method, path, status });
    }

    delayNextContainerCollection(): DelayedContainerCollection {
        let markStarted!: () => void;
        let release!: () => void;
        const started = new Promise<void>(resolve => { markStarted = resolve; });
        const released = new Promise<void>(resolve => { release = resolve; });
        this.collectionDelays.push({ started, release, markStarted, released });
        return { started, release };
    }

    async handle(route: Route): Promise<void> {
        const request = route.request();
        const method = request.method();
        const pathname = new URL(request.url()).pathname;
        const failure = this.takeFailure(method, pathname);
        if (failure) {
            await route.fulfill({
                status: failure.status,
                contentType: 'application/json',
                body: JSON.stringify({ error: { code: 'mockFailure', message: 'Injected Graph failure' } }),
            });
            return;
        }

        if (COLLECTION_PATH.test(pathname)) {
            if (method === 'GET') {
                await this.fulfillCollection(route);
                return;
            }
            if (method === 'POST') {
                const body = (request.postDataJSON() ?? {}) as {
                    displayName?: string;
                    description?: string | null;
                };
                const container = this.addContainer(body.displayName ?? 'container', body.description ?? null);
                await this.fulfill(route, 201, container);
                return;
            }
        }

        if (DELETED_COLLECTION_PATH.test(pathname) && method === 'GET') {
            await this.fulfill(route, 200, {
                value: [...this.deletedContainers.values()].map(container => ({
                    ...container,
                    deletedDateTime: new Date().toISOString(),
                })),
            });
            return;
        }

        const restore = pathname.match(RESTORE_PATH);
        if (restore && method === 'POST') {
            const container = this.deletedContainers.get(restore[1]);
            if (!container) {
                await route.fallback();
                return;
            }
            this.deletedContainers.delete(container.id);
            this.staleDeletedIds.delete(container.id);
            if (!this.findContainer(container.id)) {
                this.containers.push(container);
            }
            this.releasedIds.add(container.id);
            await this.fulfill(route, 200, container);
            return;
        }

        const activate = pathname.match(ACTIVATE_PATH);
        if (activate && method === 'POST') {
            const container = this.findContainer(activate[1]);
            if (!container) {
                await route.fallback();
                return;
            }
            container.status = 'active';
            await this.fulfill(route, 200, container);
            return;
        }

        const item = pathname.match(ITEM_PATH);
        if (!item) {
            await route.fallback();
            return;
        }
        const container = this.findContainer(item[1])
            ?? (item[1] === this.seed.id ? this.seed : undefined);
        if (!container) {
            await route.fallback();
            return;
        }

        if (method === 'GET') {
            await this.fulfill(route, 200, container);
        } else if (method === 'PATCH' && container !== this.seed) {
            const body = (request.postDataJSON() ?? {}) as { displayName?: string; description?: string };
            if (typeof body.displayName === 'string') { container.displayName = body.displayName; }
            if (typeof body.description === 'string') { container.description = body.description; }
            await this.fulfill(route, 200, container);
        } else if (method === 'DELETE' && container !== this.seed) {
            this.deletedContainers.set(container.id, container);
            if (!this.staleDeletedIds.has(container.id)) {
                this.completeContainerDeletion(container.id);
            }
            await route.fulfill({ status: 204, body: '' });
        } else {
            await route.fallback();
        }
    }

    private addContainer(displayName: string, description: string | null): ConsistencyMockContainer {
        this.sequence += 1;
        const id = `b!consistency-${this.sequence}`;
        const container: ConsistencyMockContainer = {
            id,
            displayName,
            description,
            containerTypeId: 'ct-mock-00000000-0000-0000-0000-000000000000',
            createdDateTime: new Date().toISOString(),
            status: 'inactive',
            lockState: 'unlocked',
            assignedSensitivityLabel: null,
            drive: { id, quota: { used: 0 } },
        };
        this.containers.push(container);
        return container;
    }

    private async fulfillCollection(route: Route): Promise<void> {
        const value = [
            this.toCollectionItem(this.seed),
            ...this.containers
                .filter(container => this.releasedIds.has(container.id))
                .map(container => this.toCollectionItem(container)),
        ];
        const delay = this.collectionDelays.shift();
        if (delay) {
            delay.markStarted();
            await delay.released;
        }
        await this.fulfill(route, 200, { value });
    }

    private toCollectionItem(container: ConsistencyMockContainer): Record<string, unknown> {
        const item: Record<string, unknown> = { ...container };
        delete item.status;
        return item;
    }

    private takeFailure(method: string, pathname: string): FailureRule | undefined {
        const index = this.failures.findIndex(rule => {
            rule.path.lastIndex = 0;
            return rule.method === method && rule.path.test(pathname);
        });
        return index < 0 ? undefined : this.failures.splice(index, 1)[0];
    }

    private async fulfill(route: Route, status: number, body: unknown): Promise<void> {
        await route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify(body),
        });
    }
}

export async function installContainerConsistencyMock(page: Page): Promise<ContainerConsistencyMock> {
    const mock = new ContainerConsistencyMock();
    await page.route(
        url => url.hostname === 'graph.microsoft.com'
            && (
                url.pathname.includes('/storage/fileStorage/containers')
                || url.pathname.includes('/storage/fileStorage/deletedContainers')
            ),
        route => mock.handle(route),
    );
    return mock;
}

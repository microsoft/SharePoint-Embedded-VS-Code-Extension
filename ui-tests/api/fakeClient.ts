/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A fake Microsoft Graph SDK `Client` that records the fluent request it was asked to build
 * (path, version, query options, headers, body, HTTP verb) so API-layer tests can assert the
 * exact request each `*GraphService` method shapes — without any network.
 */

export interface RecordedCall {
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    path: string;
    version?: string;
    filter?: string;
    select?: string | string[];
    expand?: string;
    search?: string;
    top?: number;
    headers: Record<string, string>;
    body?: unknown;
}

export type Responder = (call: RecordedCall) => unknown;

class FakeRequest {
    private call: RecordedCall;
    constructor(path: string, private readonly log: RecordedCall[], private readonly responder: Responder) {
        this.call = { method: 'GET', path, headers: {} };
    }
    version(v: string) { this.call.version = v; return this; }
    filter(f: string) { this.call.filter = f; return this; }
    select(s: string | string[]) { this.call.select = s; return this; }
    expand(e: string) { this.call.expand = e; return this; }
    search(s: string) { this.call.search = s; return this; }
    top(n: number) { this.call.top = n; return this; }
    orderby(_o: string) { return this; }
    count(_c?: boolean) { return this; }
    header(k: string, v: string) { this.call.headers[k] = v; return this; }
    headers(h: Record<string, string>) { Object.assign(this.call.headers, h); return this; }
    query(_q: unknown) { return this; }

    private finish(method: RecordedCall['method'], body?: unknown) {
        this.call.method = method;
        if (body !== undefined) { this.call.body = body; }
        this.log.push(this.call);
        return Promise.resolve(this.responder(this.call));
    }
    get() { return this.finish('GET'); }
    post(body?: unknown) { return this.finish('POST', body); }
    patch(body?: unknown) { return this.finish('PATCH', body); }
    put(body?: unknown) { return this.finish('PUT', body); }
    delete() { return this.finish('DELETE'); }
}

export class FakeGraphClient {
    readonly calls: RecordedCall[] = [];
    /** Override to control what a terminal call resolves to. Default: `{ value: [] }`. */
    responder: Responder = () => ({ value: [] });

    api(path: string): FakeRequest {
        return new FakeRequest(path, this.calls, (call) => this.responder(call));
    }

    /** The single (or last) recorded call — convenience for single-request methods. */
    get last(): RecordedCall {
        return this.calls[this.calls.length - 1];
    }
    reset(): void {
        this.calls.length = 0;
        this.responder = () => ({ value: [] });
    }
}

/** Minimal auth-provider stub accepted by the services (only `invalidateCache` is used). */
export const fakeAuthProvider = {
    getAccessToken: async () => 'fake-token',
    invalidateCache: () => { /* no-op */ },
} as unknown as import('../../webview-ui/src/api/WebviewAuthProvider').WebviewAuthProvider;

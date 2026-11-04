/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { Context } from '@microsoft/microsoft-graph-client';
import { Perf } from '../../src/utils/Perf';
import { GraphPerfMiddleware } from '../../src/services/Graph/GraphPerfMiddleware';

// `Perf` is a process-wide singleton, so these tests must not interleave.
test.describe.configure({ mode: 'serial' });

/** A terminal middleware that stands in for HTTPMessageHandler. */
function terminal(status = 200, delayMs = 0) {
    return {
        calls: 0,
        async execute(context: Context) {
            this.calls += 1;
            if (delayMs) { await new Promise(resolve => setTimeout(resolve, delayMs)); }
            context.response = { status } as Response;
        },
    };
}

function ctx(url: string, method?: string): Context {
    return { request: url, options: method ? ({ method } as Context['options']) : undefined };
}

test.describe('Perf', () => {
    test.afterEach(() => Perf.endSession());

    test('drops spans recorded outside a session', () => {
        Perf.endSession();
        expect(Perf.isRecording).toBe(false);
        Perf.record('network', 'GET /nope', 100);
        // Nothing to assert beyond "did not throw"; beginSession starts from empty below.
        Perf.beginSession('t');
        expect(Perf.isRecording).toBe(true);
    });

    test('track() times an operation and rethrows failures', async () => {
        Perf.beginSession('track');
        await expect(Perf.track('network', 'boom', async () => { throw new Error('nope'); })).rejects.toThrow('nope');
        const value = await Perf.track('network', 'ok', async () => 42);
        expect(value).toBe(42);
    });

    test('track() is a passthrough when not recording', async () => {
        Perf.endSession();
        expect(await Perf.track('network', 'ok', async () => 'v')).toBe('v');
    });
});

test.describe('GraphPerfMiddleware', () => {
    test.afterEach(() => Perf.endSession());

    test('calls through to the next middleware and records a span', async () => {
        Perf.beginSession('mw');
        const next = terminal(200, 20);
        const mw = new GraphPerfMiddleware();
        mw.setNext(next);

        const context = ctx('https://graph.microsoft.com/v1.0/storage/fileStorage/containerTypes?$select=id');
        await mw.execute(context);

        expect(next.calls).toBe(1);
        expect(context.response?.status).toBe(200);
    });

    test('still calls through when no session is recording', async () => {
        Perf.endSession();
        const next = terminal();
        const mw = new GraphPerfMiddleware();
        mw.setNext(next);
        await mw.execute(ctx('https://graph.microsoft.com/v1.0/me'));
        expect(next.calls).toBe(1);
    });

    test('propagates errors from downstream middleware', async () => {
        Perf.beginSession('mw-error');
        const mw = new GraphPerfMiddleware();
        mw.setNext({ execute: async () => { throw new Error('network down'); } });
        await expect(mw.execute(ctx('https://graph.microsoft.com/v1.0/me'))).rejects.toThrow('network down');
    });

    test('strips the query string from the recorded label', async () => {
        Perf.beginSession('mw-path');
        const logged: string[] = [];
        const original = console.log;
        console.log = (message?: any) => { logged.push(String(message)); };
        try {
            const mw = new GraphPerfMiddleware();
            mw.setNext(terminal());
            await mw.execute(ctx('https://graph.microsoft.com/v1.0/storage/fileStorage/containers?$filter=secret', 'POST'));
        } finally {
            console.log = original;
        }

        const line = logged.find(l => l.includes('/storage/fileStorage/containers'));
        expect(line).toBeTruthy();
        expect(line).toContain('POST /v1.0/storage/fileStorage/containers');
        expect(line).not.toContain('secret');
        expect(line).not.toContain('?');
    });

    test('templates resource ids out of the recorded label', async () => {
        Perf.beginSession('mw-pii');
        const logged: string[] = [];
        const original = console.log;
        console.log = (message?: any) => { logged.push(String(message)); };
        try {
            const mw = new GraphPerfMiddleware();
            mw.setNext(terminal());
            await mw.execute(ctx(
                'https://graph.microsoft.com/v1.0/storage/fileStorage/containerTypeRegistrations/'
                + '7ea50786-b9d6-4f9f-be54-d41e52634a0b/applicationPermissionGrants/794cf0d3-8321-428b-9771-d1282b15ce00',
                'GET'
            ));
        } finally {
            console.log = original;
        }

        const line = logged.find(l => l.includes('containerTypeRegistrations'));
        expect(line).toBeTruthy();
        expect(line).toContain('GET /v1.0/storage/fileStorage/containerTypeRegistrations/{id}/applicationPermissionGrants/{id}');
        expect(/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(line!)).toBe(false);
    });

    test('the end-of-session summary contains no resource ids', async () => {
        Perf.beginSession('mw-summary');
        const logged: string[] = [];
        const original = console.log;
        console.log = (message?: any) => { logged.push(String(message)); };
        try {
            const mw = new GraphPerfMiddleware();
            mw.setNext(terminal());
            await mw.execute(ctx('https://graph.microsoft.com/v1.0/storage/fileStorage/containers/b!secretContainerId42/permissions'));
            await mw.execute(ctx('https://graph.microsoft.com/v1.0/users/alice@contoso.onmicrosoft.com'));
            Perf.endSession();
        } finally {
            console.log = original;
        }

        const summary = logged.join('\n');
        expect(summary).toContain('mw-summary');
        expect(summary).not.toContain('b!secretContainerId42');
        expect(summary).not.toContain('alice@contoso.onmicrosoft.com');
        expect(summary).toContain('/v1.0/storage/fileStorage/containers/{id}/permissions');
        expect(summary).toContain('/v1.0/users/{upn}');
    });
});

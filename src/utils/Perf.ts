/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A single timed operation (a phase, a token acquisition, or a network request). */
export interface PerfSpan {
    /** Short label, e.g. `GET /storage/fileStorage/containerTypes`. Must not contain PII. */
    label: string;
    /** Milliseconds since the session started when this span began. */
    offsetMs: number;
    durationMs: number;
    /** `network` spans are rolled up into the "slowest calls" table. */
    kind: 'phase' | 'network' | 'auth';
    detail?: string;
}

/**
 * Lightweight timing for the sign-in / tree-load path.
 *
 * Output goes to the `SharePoint Embedded` log output channel:
 *  - per-span lines at `debug` level (hidden unless the user sets the channel to Debug/Trace)
 *  - the end-of-session summary at `info` level (a few lines per sign-in)
 *
 * Timing is wall-clock only. Labels must never carry user or tenant data: network
 * labels come from `GraphPerfMiddleware`, which templates the path (see
 * `templatizeGraphPath`) so ids, names and UPNs are replaced with placeholders, and
 * every other call site passes a static string. Bodies, headers, query strings and
 * tokens are never captured.
 */
export class Perf {
    private static _sessionLabel: string | undefined;
    private static _sessionStart = 0;
    private static _spans: PerfSpan[] = [];
    private static _idleTimer: ReturnType<typeof setTimeout> | undefined;
    private static _maxTimer: ReturnType<typeof setTimeout> | undefined;
    private static _idleMs: number | undefined;

    /** True while a session is being recorded. Spans outside a session are dropped. */
    public static get isRecording(): boolean {
        return Perf._sessionLabel !== undefined;
    }

    /** Start a new timing session, discarding any previous one. */
    public static beginSession(label: string): void {
        Perf._clearTimers();
        Perf._sessionLabel = label;
        Perf._sessionStart = Date.now();
        Perf._spans = [];
        Perf._write('debug', `[perf] ── ${label} ──`);
    }

    /**
     * Finish the session once no new span has been recorded for `idleMs`.
     *
     * Sign-in resolves before the tree finishes loading — VS Code only asks for the
     * container-type children after the view becomes visible — so closing the session
     * on an idle window is what captures the whole login-to-populated-tree picture.
     * `maxMs` bounds the wait if a request never settles.
     */
    public static endSessionWhenIdle(idleMs = 1_500, maxMs = 60_000): void {
        if (!Perf.isRecording) { return; }
        Perf._idleMs = idleMs;
        Perf._bumpIdleTimer();
        if (!Perf._maxTimer) {
            Perf._maxTimer = setTimeout(() => Perf.endSession(), maxMs);
            Perf._maxTimer.unref?.();
        }
    }

    private static _bumpIdleTimer(): void {
        if (Perf._idleMs === undefined) { return; }
        if (Perf._idleTimer) { clearTimeout(Perf._idleTimer); }
        Perf._idleTimer = setTimeout(() => Perf.endSession(), Perf._idleMs);
        Perf._idleTimer.unref?.();
    }

    private static _clearTimers(): void {
        if (Perf._idleTimer) { clearTimeout(Perf._idleTimer); Perf._idleTimer = undefined; }
        if (Perf._maxTimer) { clearTimeout(Perf._maxTimer); Perf._maxTimer = undefined; }
        Perf._idleMs = undefined;
    }

    /** Record an already-measured span. */
    public static record(kind: PerfSpan['kind'], label: string, durationMs: number, detail?: string): void {
        if (!Perf.isRecording) { return; }
        const span: PerfSpan = {
            label,
            offsetMs: Math.max(0, Perf._sessionStart ? Date.now() - durationMs - Perf._sessionStart : 0),
            durationMs,
            kind,
            detail
        };
        Perf._spans.push(span);
        Perf._write('debug', `[perf] ${String(Math.round(durationMs)).padStart(6)}ms  ${label}${detail ? `  (${detail})` : ''}`);
        Perf._bumpIdleTimer();
    }

    /** Time an async operation and record it. Errors are timed too, then rethrown. */
    public static async track<T>(kind: PerfSpan['kind'], label: string, fn: () => Promise<T>): Promise<T> {
        if (!Perf.isRecording) { return fn(); }
        const start = Date.now();
        try {
            const result = await fn();
            Perf.record(kind, label, Date.now() - start);
            return result;
        } catch (error) {
            Perf.record(kind, label, Date.now() - start, 'failed');
            throw error;
        }
    }

    /**
     * Close the session and emit the summary: total wall time, how much of it was
     * spent on the network, and the slowest individual calls.
     */
    public static endSession(): void {
        if (!Perf.isRecording) { return; }
        Perf._clearTimers();
        const label = Perf._sessionLabel!;
        const totalMs = Date.now() - Perf._sessionStart;
        const spans = Perf._spans;
        Perf._sessionLabel = undefined;
        Perf._spans = [];

        const network = spans.filter(s => s.kind === 'network');
        const auth = spans.filter(s => s.kind === 'auth');
        const networkMs = network.reduce((sum, s) => sum + s.durationMs, 0);
        const authMs = auth.reduce((sum, s) => sum + s.durationMs, 0);

        const lines: string[] = [
            `[perf] ${label}: ${totalMs}ms total — ${network.length} request(s) ${networkMs}ms cumulative, ${auth.length} token acquisition(s) ${authMs}ms cumulative`
        ];

        // Roll identical endpoints (e.g. the per-container-type calls) into one row so
        // an N+1 pattern is obvious from the count column.
        const byLabel = new Map<string, { count: number; totalMs: number; maxMs: number }>();
        for (const span of [...network, ...auth]) {
            const entry = byLabel.get(span.label) ?? { count: 0, totalMs: 0, maxMs: 0 };
            entry.count += 1;
            entry.totalMs += span.durationMs;
            entry.maxMs = Math.max(entry.maxMs, span.durationMs);
            byLabel.set(span.label, entry);
        }
        const rows = [...byLabel.entries()].sort((a, b) => b[1].totalMs - a[1].totalMs).slice(0, 10);
        for (const [rowLabel, entry] of rows) {
            const count = entry.count > 1 ? ` ×${entry.count} (slowest ${Math.round(entry.maxMs)}ms)` : '';
            lines.push(`[perf]   ${String(Math.round(entry.totalMs)).padStart(6)}ms  ${rowLabel}${count}`);
        }

        for (const line of lines) { Perf._write('info', line); }
    }

    private static _write(level: 'debug' | 'info', message: string): void {
        try {
            // Resolved lazily so this module carries no extension-host dependency and
            // stays importable from plain Node (tests, tooling).
            const channel = (require('./extensionVariables') as typeof import('./extensionVariables')).ext?.outputChannel;
            if (level === 'info') { channel?.info(message); } else { channel?.debug(message); }
        } catch {
            // Output channel not created yet (very early activation) — console only.
        }
        console.log(message);
    }
}

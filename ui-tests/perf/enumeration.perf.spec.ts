/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect, Browser } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { installGraphMock } from '../helpers/graphMock';
import { makeFakeGraphJwt } from '../helpers/token';
import { getCdpMetrics, domCounts, measureScroll, median, CdpMetrics, ScrollResult } from './measure';

const SIZES = [100, 500, 1000, 5000];
const CONTAINER_TYPE_ID = 'ct-perf-00000000-0000-0000-0000-000000000000';

interface Row {
    n: number;
    samples: number;
    renderMsMedian: number;
    renderMsAll: number[];
    metrics: CdpMetrics;
    dom: { totalNodes: number; rowCount: number };
    scroll: ScrollResult;
}

const results: Row[] = [];

test.describe.configure({ mode: 'serial' });

async function newInjectedPage(browser: Browser, n: number) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript(({ token, ctId }) => {
        (window as unknown as Record<string, unknown>).__STORAGE_EXPLORER_STATE__ = {
            appName: 'Perf', tenantDomain: 'contoso.onmicrosoft.com', containerTypeId: ctId, registrationId: 'reg',
        };
        (window as unknown as Record<string, unknown>).__SPE_TEST_TOKEN__ = token;
        (window as unknown as Record<string, unknown>).acquireVsCodeApi = () => ({
            postMessage: (msg: { command?: string; requestId?: string }) => {
                if (msg && msg.command === 'getToken') {
                    window.dispatchEvent(new MessageEvent('message', {
                        data: { command: 'tokenResponse', token: (window as unknown as Record<string, unknown>).__SPE_TEST_TOKEN__, requestId: msg.requestId },
                    }));
                }
            },
        });
    }, { token: makeFakeGraphJwt(), ctId: CONTAINER_TYPE_ID });

    const state = await installGraphMock(page, { containers: n });
    state.containerTypeId = CONTAINER_TYPE_ID;
    return { context, page };
}

async function measureRenderMs(page: import('@playwright/test').Page, n: number): Promise<number> {
    const t0 = Date.now();
    await page.goto('/');
    // Completion signal that works with OR without virtualization: rows are painted AND the
    // scroll container is sized for all N items (the virtualizer's spacer reflects the full count).
    await page.waitForFunction(
        (expected) => {
            const rows = document.querySelectorAll('[data-item-id]').length;
            if (rows === 0) { return false; }
            let maxScrollHeight = 0;
            for (const el of Array.from(document.querySelectorAll('*'))) {
                const e = el as HTMLElement;
                const oy = getComputedStyle(e).overflowY;
                if ((oy === 'auto' || oy === 'scroll') && e.scrollHeight > maxScrollHeight) { maxScrollHeight = e.scrollHeight; }
            }
            return maxScrollHeight >= expected * 20;
        },
        n,
        { timeout: 5 * 60_000 },
    );
    return Date.now() - t0;
}

for (const n of SIZES) {
    test(`enumeration render — ${n} containers`, async ({ browser }) => {
        const samples = n >= 5000 ? 1 : 3;
        const { context, page } = await newInjectedPage(browser, n);
        try {
            // Warm-up render (discarded).
            await measureRenderMs(page, n);

            const renderMsAll: number[] = [];
            for (let k = 0; k < samples; k++) {
                renderMsAll.push(await measureRenderMs(page, n));
            }

            // Heavy metrics on the last-rendered page.
            const metrics = await getCdpMetrics(page);
            const dom = await domCounts(page);
            const scroll = await measureScroll(page);

            results.push({ n, samples, renderMsMedian: median(renderMsAll), renderMsAll, metrics, dom, scroll });

            // With virtualization, only a bounded window of rows is mounted regardless of N.
            expect(dom.rowCount).toBeGreaterThan(0);
            expect(dom.rowCount).toBeLessThan(n);
        } finally {
            await context.close();
        }
    });
}

test.afterAll(async () => {
    if (results.length === 0) { return; }
    results.sort((a, b) => a.n - b.n);

    const fmt = (x: number, d = 0) => x.toFixed(d);
    const header = '| Containers | Render (median ms) | Rows in DOM | Total DOM nodes | JS heap (MB) | Layout (ms) | Style recalc (ms) | Scroll FPS | Long-task (ms) |';
    const sep = '|---:|---:|---:|---:|---:|---:|---:|---:|---:|';
    const rows = results.map((r) =>
        `| ${r.n} | ${fmt(r.renderMsMedian)} | ${r.dom.rowCount} | ${r.dom.totalNodes} | ${fmt(r.metrics.jsHeapUsedMB, 1)} | ${fmt(r.metrics.layoutDurationMs, 1)} | ${fmt(r.metrics.recalcStyleDurationMs, 1)} | ${r.scroll.fps == null ? 'n/a' : fmt(r.scroll.fps, 1)} | ${fmt(r.scroll.longTaskTotalMs)} |`,
    );

    // ── Verdict (data-driven across all sizes) ───────────────────────────────
    const RENDER_BUDGET_MS = 1000;
    const FPS_FLOOR = 30;
    const linearDom = results.every((r) => r.dom.rowCount === r.n);
    const problem = (r: Row) => r.renderMsMedian > RENDER_BUDGET_MS || (r.scroll.fps ?? 60) < FPS_FLOOR;
    const firstBad = results.find(problem);
    const lastGood = [...results].reverse().find((r) => !problem(r));
    const worst = results[results.length - 1];
    const isProblem = !!firstBad;

    const verdict: string[] = [];
    const maxRows = Math.max(...results.map((r) => r.dom.rowCount));
    verdict.push(linearDom
        ? '- **No virtualization**: rendered DOM rows grow 1:1 with the container count — every item is a live DOM subtree, so cost scales linearly with N.'
        : `- **Virtualized (windowing active)**: only ~${maxRows} rows are ever in the DOM — even at ${worst.n} items — so render/scroll cost is bounded to the viewport instead of scaling with N.`);
    for (const r of results) {
        verdict.push(`  - **${r.n}**: render ≈ ${fmt(r.renderMsMedian)} ms, scroll ≈ ${r.scroll.fps == null ? 'n/a' : fmt(r.scroll.fps, 1)} FPS, ${r.dom.totalNodes} DOM nodes, ${fmt(r.metrics.jsHeapUsedMB, 1)} MB heap${problem(r) ? '  ⚠️' : ''}`);
    }
    if (isProblem) {
        verdict.push('');
        verdict.push(`- **Verdict: it holds up to ~${lastGood ? lastGood.n : '<100'} containers, then degrades.** ` +
            `The first size to breach budget (>${RENDER_BUDGET_MS} ms render or <${FPS_FLOOR} FPS scroll) is **${firstBad!.n}** ` +
            `(render ≈ ${fmt(firstBad!.renderMsMedian)} ms, scroll ≈ ${firstBad!.scroll.fps == null ? 'n/a' : fmt(firstBad!.scroll.fps, 1)} FPS). ` +
            `At the top end (**${worst.n}**): render ≈ ${fmt(worst.renderMsMedian)} ms, scroll ≈ ${worst.scroll.fps == null ? 'n/a' : fmt(worst.scroll.fps, 1)} FPS, ` +
            `${fmt(worst.scroll.longTaskTotalMs)} ms of main-thread long-tasks during scroll.`);
        verdict.push('- **Recommendation:** if large container counts are expected, **virtualize** the enumeration list (`@tanstack/react-virtual` or `react-window`) so only visible rows are in the DOM — this flattens render/scroll cost to O(viewport). Cheaper stopgaps: paginate or cap the page size handed to the renderer.');
    } else {
        verdict.push('');
        verdict.push(`- **Verdict: acceptable across all tested sizes** (up to ${worst.n}) — render stayed under ${RENDER_BUDGET_MS} ms and scroll above ${FPS_FLOOR} FPS. Re-check on lower-end hardware (CPU-throttling knob) or if row complexity grows.`);
    }

    const md = [
        '# Storage Explorer — enumeration rendering benchmark',
        '',
        '_Generated by `npm run test:perf`. Measured against a **production** build of the webview',
        '(`vite build` + `vite preview`) with Microsoft Graph mocked to return N containers._',
        '',
        header, sep, ...rows,
        '',
        '## Findings',
        ...verdict,
        '',
        '### Notes',
        '- Render time = wall-clock from navigation until rows are painted and the list is sized for all N items (median of samples; 1 sample at 5000). With virtualization, only a viewport-sized window of rows is mounted at a time.',
        '- Real Microsoft Graph pages container results, so "N in one response" is a synthetic worst case that isolates the *renderer*.',
        '- Numbers are machine-dependent; treat them as relative across sizes, not absolute.',
        '',
    ].join('\n');

    const outDir = path.join(__dirname, 'results');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'perf-report.md'), md, 'utf8');
    fs.writeFileSync(path.join(outDir, 'perf-report.json'), JSON.stringify(results, null, 2), 'utf8');

    // Echo to the console so it shows up in the run output.
    // eslint-disable-next-line no-console
    console.log('\n' + md + `\nReport written to: ${path.join(outDir, 'perf-report.md')}\n`);
});

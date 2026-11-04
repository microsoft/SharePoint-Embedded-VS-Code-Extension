/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Page } from '@playwright/test';

export interface CdpMetrics {
    nodes: number;
    jsHeapUsedMB: number;
    layoutDurationMs: number;
    recalcStyleDurationMs: number;
    layoutCount: number;
    scriptDurationMs: number;
}

/** Read Chrome DevTools Protocol performance counters for the page. */
export async function getCdpMetrics(page: Page): Promise<CdpMetrics> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const { metrics } = await cdp.send('Performance.getMetrics');
    const map = new Map(metrics.map((m) => [m.name, m.value] as const));
    const s = (name: string) => map.get(name) ?? 0;
    return {
        nodes: s('Nodes'),
        jsHeapUsedMB: s('JSHeapUsedSize') / (1024 * 1024),
        layoutDurationMs: s('LayoutDuration') * 1000,
        recalcStyleDurationMs: s('RecalcStyleDuration') * 1000,
        layoutCount: s('LayoutCount'),
        scriptDurationMs: s('ScriptDuration') * 1000,
    };
}

/** Total DOM node count + rendered enumeration-row count. */
export async function domCounts(page: Page): Promise<{ totalNodes: number; rowCount: number }> {
    return page.evaluate(() => ({
        totalNodes: document.querySelectorAll('*').length,
        // Row wrappers carry a unique data-item-id (the `file-row-menu` button shares the
        // `file-row-` testid prefix, so counting by prefix would double-count).
        rowCount: document.querySelectorAll('[data-item-id]').length,
    }));
}

export interface ScrollResult {
    scrollable: boolean;
    fps: number | null;
    longTaskTotalMs: number;
    longTaskCount: number;
}

/**
 * Scroll the list from top to bottom while sampling requestAnimationFrame timing to estimate FPS,
 * and record any Long Tasks (main-thread blocks > 50ms) that occur during the scroll.
 */
export async function measureScroll(page: Page): Promise<ScrollResult> {
    return page.evaluate(async () => {
        // Find the tallest scroll container (the file list).
        const all = Array.from(document.querySelectorAll('*')) as HTMLElement[];
        let scroller: HTMLElement | null = null;
        let maxDelta = 0;
        for (const el of all) {
            const delta = el.scrollHeight - el.clientHeight;
            const oy = getComputedStyle(el).overflowY;
            if (delta > maxDelta && (oy === 'auto' || oy === 'scroll')) {
                maxDelta = delta;
                scroller = el;
            }
        }
        if (!scroller || maxDelta <= 0) {
            return { scrollable: false, fps: null, longTaskTotalMs: 0, longTaskCount: 0 };
        }

        const longTasks: number[] = [];
        let po: PerformanceObserver | undefined;
        try {
            po = new PerformanceObserver((list) => {
                for (const e of list.getEntries()) { longTasks.push(e.duration); }
            });
            po.observe({ entryTypes: ['longtask'] });
        } catch { /* longtask not supported */ }

        const target = scroller;
        const start = performance.now();
        let frames = 0;
        const step = Math.max(20, Math.floor(maxDelta / 60));

        await new Promise<void>((resolve) => {
            const frame = () => {
                frames++;
                target.scrollTop = Math.min(target.scrollTop + step, maxDelta);
                if (target.scrollTop >= maxDelta || performance.now() - start > 3000) { resolve(); return; }
                requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
        });

        const elapsed = performance.now() - start;
        po?.disconnect();
        return {
            scrollable: true,
            fps: frames / (elapsed / 1000),
            longTaskTotalMs: longTasks.reduce((a, b) => a + b, 0),
            longTaskCount: longTasks.length,
        };
    });
}

export function median(values: number[]): number {
    if (values.length === 0) { return 0; }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

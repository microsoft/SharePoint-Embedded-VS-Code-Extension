/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { escapeHtmlAttribute, sanitizeCspSource, serializeJsonForHtml } from '../../src/services/StorageExplorer/htmlEncoding';

/** Mirrors the block emitted by `StorageExplorerPanel._buildHtml`. */
function embed(value: unknown): string {
    return `<script type="application/json" id="spe-state">${serializeJsonForHtml(value)}</script>`;
}

/**
 * A `<script>` element is an HTML *raw text* element: the tokenizer scans for the literal
 * end tag and performs no entity decoding. So "does an end tag appear early?" is the whole
 * question, and counting occurrences of `</script` is a faithful check.
 */
function endTagCount(html: string): number {
    return html.split(/<\/script/i).length - 1;
}

test.describe('serializeJsonForHtml — script-context breakout', () => {
    test('a value containing a literal </script> cannot close the element', () => {
        const html = embed({ appName: 'x</script><img src=x onerror=alert(1)>' });
        expect(endTagCount(html)).toBe(1);
        expect(html).toContain('\\u003c/script\\u003e');
    });

    test('mixed-case and whitespace-padded end tags are neutralised too', () => {
        for (const payload of ['</SCRIPT>', '</ScRiPt >', '</script\t>', '</script\n>', '</script/']) {
            expect(endTagCount(embed({ appName: payload }))).toBe(1);
        }
    });

    test('output contains no raw <, > or & at all', () => {
        const json = serializeJsonForHtml({
            appName: '<b>&</b>',
            tenantDomain: 'a>b<c&d',
            nested: { deep: ['</script>', '<!--', '<![CDATA['] },
        });
        expect(json).not.toMatch(/[<>&]/);
    });

    test('escapes the characters called out by the review', () => {
        expect(serializeJsonForHtml('<')).toBe('"\\u003c"');
        expect(serializeJsonForHtml('>')).toBe('"\\u003e"');
        expect(serializeJsonForHtml('&')).toBe('"\\u0026"');
        expect(serializeJsonForHtml('\u2028')).toBe('"\\u2028"');
        expect(serializeJsonForHtml('\u2029')).toBe('"\\u2029"');
    });

    test('an HTML comment opener cannot start a comment', () => {
        // `<!--` inside a script would put the legacy tokenizer into comment state.
        expect(serializeJsonForHtml('<!--')).not.toContain('<');
    });
});

test.describe('serializeJsonForHtml — round-trip fidelity', () => {
    test('escaping is transparent to JSON.parse', () => {
        const state = {
            appName: 'Contoso </script><script>alert(1)</script>',
            tenantDomain: 'contoso.onmicrosoft.com',
            containerTypeId: '00000000-0000-0000-0000-000000000001',
            registrationId: '00000000-0000-0000-0000-000000000002',
        };
        expect(JSON.parse(serializeJsonForHtml(state))).toEqual(state);
    });

    test('preserves unicode, emoji and RTL text in display names', () => {
        const state = { appName: 'مرحبا 契約 📄 café', tenantDomain: 'ünïcode.example' };
        expect(JSON.parse(serializeJsonForHtml(state))).toEqual(state);
    });

    test('preserves the line-separator characters it escapes', () => {
        expect(JSON.parse(serializeJsonForHtml('a\u2028b\u2029c'))).toBe('a\u2028b\u2029c');
    });

    test('preserves quotes, backslashes and newlines', () => {
        const value = 'quote " backslash \\ newline \n tab \t';
        expect(JSON.parse(serializeJsonForHtml(value))).toBe(value);
    });

    test('handles the primitives and containers a state object can hold', () => {
        for (const value of [null, 0, -1.5, true, false, '', [], {}, [1, 'a', null]]) {
            expect(JSON.parse(serializeJsonForHtml(value))).toEqual(value);
        }
    });
});

test.describe('serializeJsonForHtml — unserializable values', () => {
    test('undefined becomes null rather than a JSON.parse syntax error', () => {
        expect(serializeJsonForHtml(undefined)).toBe('null');
        expect(JSON.parse(serializeJsonForHtml(undefined))).toBeNull();
    });

    test('a function or symbol also degrades to null', () => {
        expect(serializeJsonForHtml(() => 1)).toBe('null');
        expect(serializeJsonForHtml(Symbol('s'))).toBe('null');
    });

    test('output is always valid JSON', () => {
        for (const value of [undefined, () => 1, { a: undefined }, [undefined]]) {
            expect(() => JSON.parse(serializeJsonForHtml(value))).not.toThrow();
        }
    });
});

test.describe('escapeHtmlAttribute', () => {
    test('escapes the characters that can break out of a quoted attribute', () => {
        expect(escapeHtmlAttribute('"')).toBe('&quot;');
        expect(escapeHtmlAttribute('\'')).toBe('&#39;');
        expect(escapeHtmlAttribute('<')).toBe('&lt;');
        expect(escapeHtmlAttribute('>')).toBe('&gt;');
        expect(escapeHtmlAttribute('&')).toBe('&amp;');
    });

    test('a value cannot escape a double-quoted attribute', () => {
        const html = `<meta content="${escapeHtmlAttribute('x" onload="alert(1)')}">`;
        expect(html).toBe('<meta content="x&quot; onload=&quot;alert(1)">');
    });

    test('escapes the ampersand first so entities are not double-decoded', () => {
        expect(escapeHtmlAttribute('&lt;')).toBe('&amp;lt;');
    });

    test('leaves ordinary resource URIs and nonces untouched', () => {
        const uri = 'https://file%2B.vscode-resource.vscode-cdn.net/out/webviewApp/assets/index.js';
        expect(escapeHtmlAttribute(uri)).toBe(uri);
        expect(escapeHtmlAttribute('AbC-_123xyz')).toBe('AbC-_123xyz');
    });
});

test.describe('sanitizeCspSource', () => {
    // The literal VS Code produces: `webviewGenericCspSource` in
    // src/vs/workbench/contrib/webview/common/webview.ts. Note it is a *list* of two sources.
    const REAL_CSP_SOURCE = `'self' https://*.vscode-cdn.net`;

    test('passes the real VS Code cspSource through byte-for-byte', () => {
        // Regression guard: an earlier character-stripping implementation collapsed this to
        // `selfhttps://*.vscode-cdn.net`, invalidating style-src/font-src/img-src so the
        // stylesheet and icon fonts were blocked and the panel rendered unstyled.
        expect(sanitizeCspSource(REAL_CSP_SOURCE)).toBe(REAL_CSP_SOURCE);
    });

    test('keeps the quoted keyword and the host as separate sources', () => {
        expect(sanitizeCspSource(REAL_CSP_SOURCE).split(' ')).toEqual([`'self'`, 'https://*.vscode-cdn.net']);
    });

    test('passes other real webview source forms through unchanged', () => {
        for (const source of [
            'vscode-webview://5f1e0c2a-1b2c-4d3e-9f8a-7b6c5d4e3f2a',
            'https://*.vscode-cdn.net',
            'https://file%2B.vscode-resource.vscode-cdn.net',
            `'self'`,
            `'self' https://*.vscode-cdn.net https://file%2B.vscode-resource.vscode-cdn.net`,
        ]) {
            expect(sanitizeCspSource(source)).toBe(source);
        }
    });

    test('a directive built from it still gates styles and fonts correctly', () => {
        const source = sanitizeCspSource(REAL_CSP_SOURCE);
        expect(`style-src ${source} 'unsafe-inline'`).toBe(`style-src 'self' https://*.vscode-cdn.net 'unsafe-inline'`);
        expect(`font-src ${source}`).toBe(`font-src 'self' https://*.vscode-cdn.net`);
    });

    test('drops tokens that could break out of the attribute', () => {
        expect(sanitizeCspSource('https://x" onload="alert(1)')).toBe('');
        expect(sanitizeCspSource('https://x<script>')).toBe('');
    });

    test('drops a token that could inject another directive', () => {
        expect(sanitizeCspSource("https://a; script-src 'unsafe-inline'")).toBe('script-src');
    });

    test('drops keywords that would widen the policy', () => {
        expect(sanitizeCspSource(`'unsafe-inline'`)).toBe('');
        expect(sanitizeCspSource(`'unsafe-eval'`)).toBe('');
        expect(sanitizeCspSource(`'strict-dynamic'`)).toBe('');
        expect(sanitizeCspSource(`'self' 'unsafe-inline'`)).toBe(`'self'`);
    });

    test('keeps a good source even when a bad one sits beside it', () => {
        expect(sanitizeCspSource(`'self' bad"token https://*.vscode-cdn.net`))
            .toBe(`'self' https://*.vscode-cdn.net`);
    });

    test('a sanitized source can never carry a quote-delimiter, angle bracket or ampersand', () => {
        const sanitized = sanitizeCspSource('a"b\'c<d>e&f;g h\ni');
        expect(sanitized).not.toMatch(/["<>&;]/);
        expect(sanitized).not.toContain('\n');
    });

    test('normalises odd whitespace without corrupting the sources', () => {
        expect(sanitizeCspSource(`  'self'\t\thttps://*.vscode-cdn.net \n`)).toBe(REAL_CSP_SOURCE);
    });

    test('the resulting policy is emitted verbatim and stays parseable', () => {
        const csp = `default-src 'none'; script-src 'nonce-AbC123'; img-src ${sanitizeCspSource(REAL_CSP_SOURCE)} data:`;
        expect(`<meta content="${csp}">`).toContain(`script-src 'nonce-AbC123'`);
        expect(csp).toContain(`img-src 'self' https://*.vscode-cdn.net data:`);
        expect(csp).not.toContain('"');
    });
});

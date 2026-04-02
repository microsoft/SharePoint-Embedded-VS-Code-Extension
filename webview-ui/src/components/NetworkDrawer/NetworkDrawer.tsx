import React, { useState, useCallback, useRef, useEffect } from 'react';
import { NetworkRequest } from '../../models/StorageItem';
import { useStorageExplorer } from '../../context/StorageExplorerContext';
import { useResizableColumns, ColResizeHandle } from '../../hooks/useResizableColumns';

const METHOD_COLORS: Record<string, string> = {
    GET:    'var(--vscode-symbolIcon-classForeground, #4ec9b0)',
    POST:   'var(--vscode-symbolIcon-constructorForeground, #b8d7a3)',
    PATCH:  'var(--vscode-symbolIcon-enumeratorForeground, #c8c8ff)',
    PUT:    'var(--vscode-symbolIcon-enumeratorForeground, #c8c8ff)',
    DELETE: 'var(--vscode-errorForeground)',
};

function statusColor(status: number): string {
    if (status === 0)        return 'var(--vscode-foreground)';
    if (status < 300)        return 'var(--vscode-terminal-ansiGreen, #4ec9b0)';
    if (status < 400)        return 'var(--vscode-terminal-ansiYellow, #cca700)';
    return 'var(--vscode-errorForeground)';
}

function formatDuration(ms: number): string {
    return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`;
}

function formatTimestamp(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function buildHar(requests: NetworkRequest[]): string {
    const entries = requests.map(r => ({
        startedDateTime: r.timestamp,
        time: r.durationMs,
        request: {
            method: r.method,
            url: r.url,
            httpVersion: 'HTTP/1.1',
            headers: Object.entries(r.requestHeaders).map(([name, value]) => ({ name, value })),
            queryString: [],
            cookies: [],
            headersSize: -1,
            bodySize: r.requestBody ? r.requestBody.length : 0,
            postData: r.requestBody ? { mimeType: 'application/json', text: r.requestBody } : undefined,
        },
        response: {
            status: r.status,
            statusText: r.statusText,
            httpVersion: 'HTTP/1.1',
            headers: Object.entries(r.responseHeaders).map(([name, value]) => ({ name, value })),
            cookies: [],
            content: {
                size: r.responseBody ? r.responseBody.length : 0,
                mimeType: r.responseHeaders['Content-Type'] ?? 'application/json',
                text: r.responseBody ?? '',
            },
            redirectURL: '',
            headersSize: -1,
            bodySize: r.responseBody ? r.responseBody.length : 0,
        },
        cache: {},
        timings: { send: 0, wait: r.durationMs, receive: 0 },
    }));

    return JSON.stringify({
        log: {
            version: '1.2',
            creator: { name: 'SharePoint Embedded - Storage Explorer', version: '1.0' },
            entries,
        },
    }, null, 2);
}

// ─── Detail pane ────────────────────────────────────────────────────────────

type DetailTab = 'request' | 'response';

// ─── JSON syntax colouriser ────────────────────────────────────────────────────────────────────────────

const JSON_TOKEN_RE = /"(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?/g;

const TOKEN_COLORS: Record<string, string> = {
    key:     'var(--vscode-debugTokenExpression-name, #9CDCFE)',
    string:  'var(--vscode-debugTokenExpression-string, #CE9178)',
    number:  'var(--vscode-debugTokenExpression-number, #B5CEA8)',
    boolean: 'var(--vscode-debugTokenExpression-boolean, #569CD6)',
    null:    'var(--vscode-debugTokenExpression-boolean, #569CD6)',
};

function JsonColorize({ text }: { text: string }) {
    const parts: { text: string; color?: string }[] = [];
    const re = new RegExp(JSON_TOKEN_RE.source, 'g');
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ text: text.slice(lastIndex, match.index) });
        }
        const raw = match[0];
        let type: string;
        if (raw.startsWith('"') && match[2]?.includes(':')) { type = 'key'; }
        else if (raw.startsWith('"'))                       { type = 'string'; }
        else if (raw === 'true' || raw === 'false')          { type = 'boolean'; }
        else if (raw === 'null')                             { type = 'null'; }
        else                                                 { type = 'number'; }
        parts.push({ text: raw, color: TOKEN_COLORS[type] });
        lastIndex = re.lastIndex;
    }
    if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex) });
    return <>{parts.map((p, i) => <span key={i} style={p.color ? { color: p.color } : undefined}>{p.text}</span>)}</>;
}

// ─── Header table ────────────────────────────────────────────────────────────────────────────────

function HeadersTable({ headers }: { headers: Record<string, string> }) {
    const [copied, setCopied] = useState<string | null>(null);

    function copy(key: string, value: string) {
        navigator.clipboard.writeText(value).then(() => {
            setCopied(key);
            setTimeout(() => setCopied(null), 1500);
        }).catch(() => {});
    }

    const entries = Object.entries(headers);
    if (entries.length === 0) {
        return <span style={{ opacity: 0.5, fontSize: 12 }}>No headers</span>;
    }
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
                {entries.map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
                        <td style={{ padding: '3px 8px 3px 0', fontWeight: 600, whiteSpace: 'nowrap', opacity: 0.75, verticalAlign: 'top', width: 1, paddingRight: 16 }}>{k}</td>
                        <td style={{ padding: '3px 0' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                <span style={{ flex: 1, wordBreak: 'break-all' }}>{v}</span>
                                <button
                                    className="icon-btn"
                                    title={copied === k ? 'Copied!' : `Copy ${k}`}
                                    style={{ fontSize: 11, flexShrink: 0, padding: '0 2px', marginTop: 1 }}
                                    onClick={() => copy(k, v)}
                                >
                                    <span
                                        className={`codicon codicon-${copied === k ? 'check' : 'copy'}`}
                                        style={copied === k ? { color: 'var(--vscode-testing-iconPassed, #73c991)' } : undefined}
                                    />
                                </button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function BodyBlock({ body }: { body?: string }) {
    const [copied, setCopied] = useState(false);

    if (!body) return <span style={{ opacity: 0.5, fontSize: 12 }}>No body</span>;

    let pretty = body;
    let isJson = false;
    try { pretty = JSON.stringify(JSON.parse(body), null, 2); isJson = true; } catch {}

    function copyBody() {
        navigator.clipboard.writeText(pretty).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                <button
                    className="icon-btn"
                    title={copied ? 'Copied!' : 'Copy body'}
                    style={{ fontSize: 12 }}
                    onClick={copyBody}
                >
                    <span
                        className={`codicon codicon-${copied ? 'check' : 'copy'}`}
                        style={copied ? { color: 'var(--vscode-testing-iconPassed, #73c991)' } : undefined}
                    />
                </button>
            </div>
            <pre style={{
                margin: 0,
                padding: 8,
                background: 'var(--vscode-textBlockQuote-background, rgba(127,127,127,0.1))',
                borderRadius: 3,
                fontSize: 12,
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 300,
                overflowY: 'auto',
                lineHeight: 1.5,
            }}>
                {isJson ? <JsonColorize text={pretty} /> : pretty}
            </pre>
        </div>
    );
}

function RequestDetail({ req, onClose }: { req: NetworkRequest; onClose: () => void }) {
    const [tab, setTab] = useState<DetailTab>('request');
    const [copiedUrl, setCopiedUrl] = useState(false);

    useEffect(() => { setCopiedUrl(false); }, [req.id]);

    function copyUrl() {
        navigator.clipboard.writeText(req.url).then(() => {
            setCopiedUrl(true);
            setTimeout(() => setCopiedUrl(false), 1500);
        }).catch(() => {});
    }

    return (
        <div style={{
            width: 380,
            flexShrink: 0,
            borderLeft: '1px solid var(--vscode-panel-border)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backgroundColor: 'var(--vscode-sideBar-background, var(--vscode-editor-background))',
        }}>
            {/* Detail header */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px 0', borderBottom: '1px solid var(--vscode-panel-border)', flexShrink: 0, gap: 2 }}>
                {(['request', 'response'] as DetailTab[]).map(t => (
                    <button
                        key={t}
                        className={`tab-btn${tab === t ? ' active' : ''}`}
                        onClick={() => setTab(t)}
                        style={{ textTransform: 'capitalize' }}
                    >
                        {t}
                    </button>
                ))}
                <div style={{ flex: 1 }} />
                <button className="icon-btn" title="Close detail" style={{ fontSize: 14 }} onClick={onClose}>
                    <span className="codicon codicon-close" />
                </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {tab === 'request' ? (
                    <>
                        {/* URL */}
                        <section>
                            <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.6, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>URL</div>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                <div style={{ flex: 1, fontSize: 12, wordBreak: 'break-all', opacity: 0.9 }}>{req.url}</div>
                                <button
                                    className="icon-btn"
                                    title={copiedUrl ? 'Copied!' : 'Copy URL'}
                                    style={{ fontSize: 12, flexShrink: 0 }}
                                    onClick={copyUrl}
                                >
                                    <span
                                        className={`codicon codicon-${copiedUrl ? 'check' : 'copy'}`}
                                        style={copiedUrl ? { color: 'var(--vscode-testing-iconPassed, #73c991)' } : undefined}
                                    />
                                </button>
                            </div>
                        </section>
                        <section>
                            <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.6, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Headers</div>
                            <HeadersTable headers={req.requestHeaders} />
                        </section>
                        <section>
                            <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.6, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Body</div>
                            <BodyBlock body={req.requestBody} />
                        </section>
                    </>
                ) : (
                    <>
                        <section>
                            <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.6, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: statusColor(req.status) }}>
                                {req.status} {req.statusText}
                            </span>
                        </section>
                        <section>
                            <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.6, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Headers</div>
                            <HeadersTable headers={req.responseHeaders} />
                        </section>
                        <section>
                            <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.6, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Body</div>
                            <BodyBlock body={req.responseBody} />
                        </section>
                    </>
                )}
            </div>
        </div>
    );
}

// col widths: Time, Method, URL, Status, Duration
const COL_LABELS = ['Time', 'Method', 'URL', 'Status', 'Duration'];

const MIN_HEIGHT = 140;
const DEFAULT_HEIGHT = 260;
const MAX_HEIGHT = 600;

export function NetworkDrawer() {
    const { networkRequests, clearNetworkRequests, toggleNetworkDrawer } = useStorageExplorer();
    const [drawerHeight, setDrawerHeight] = useState(DEFAULT_HEIGHT);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const { colWidths, onColResizeMouseDown } = useResizableColumns([84, 72, 320, 72, 88]);

    // Drag state for drawer height only
    const drawerDragY = useRef<number | null>(null);
    const drawerDragH = useRef<number>(DEFAULT_HEIGHT);

    const selectedReq = networkRequests.find(r => r.id === selectedId) ?? null;

    // ── drawer resize (vertical) ────────────────────────────────────────────
    const onDrawerResizeMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        drawerDragY.current = e.clientY;
        drawerDragH.current = drawerHeight;
    }, [drawerHeight]);

    useEffect(() => {
        function onMove(e: MouseEvent) {
            if (drawerDragY.current !== null) {
                const delta = drawerDragY.current - e.clientY;
                setDrawerHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, drawerDragH.current + delta)));
            }
        }
        function onUp() { drawerDragY.current = null; }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
    }, []);

    // ── HAR export ─────────────────────────────────────────────────────────
    function handleExport() {
        const har = buildHar(networkRequests);
        // @ts-ignore — vscode acquireVsCodeApi is injected at runtime
        const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;
        if (vscode) {
            vscode.postMessage({ command: 'exportHar', har });
        } else {
            // Fallback for dev: download inline
            const blob = new Blob([har], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'storage-explorer.har'; a.click();
            URL.revokeObjectURL(url);
        }
    }

    return (
        <div style={{
            height: drawerHeight,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            borderTop: '1px solid var(--vscode-panel-border)',
            backgroundColor: 'var(--vscode-editor-background)',
        }}>
            {/* Resize handle */}
            <div
                onMouseDown={onDrawerResizeMouseDown}
                style={{
                    height: 4,
                    cursor: 'ns-resize',
                    flexShrink: 0,
                    backgroundColor: 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--vscode-focusBorder)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            />

            {/* Toolbar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderBottom: '1px solid var(--vscode-panel-border)',
                flexShrink: 0,
                height: 32,
            }}>
                <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.7, marginRight: 4 }}>Network</span>
                {networkRequests.length > 0 && (
                    <span style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 10,
                        backgroundColor: 'var(--vscode-badge-background)',
                        color: 'var(--vscode-badge-foreground)',
                    }}>
                        {networkRequests.length}
                    </span>
                )}
                <div style={{ flex: 1 }} />
                <button className="icon-btn" title="Export as HAR" style={{ fontSize: 14 }} onClick={handleExport} disabled={networkRequests.length === 0}>
                    <span className="codicon codicon-export" />
                </button>
                <button className="icon-btn" title="Clear" style={{ fontSize: 14 }} onClick={() => { clearNetworkRequests(); setSelectedId(null); }} disabled={networkRequests.length === 0}>
                    <span className="codicon codicon-clear-all" />
                </button>
                <button className="icon-btn" title="Close" style={{ fontSize: 14 }} onClick={toggleNetworkDrawer}>
                    <span className="codicon codicon-close" />
                </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Request list */}
                <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
                    {networkRequests.length === 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4, fontSize: 12 }}>
                            No requests recorded
                        </div>
                    ) : (
                        <table style={{ borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed', width: colWidths.reduce((s, w) => s + w, 0), minWidth: '100%' }}>
                            <colgroup>
                                {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
                            </colgroup>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
                                    {COL_LABELS.map((label, i) => (
                                        <th key={label} style={{
                                            padding: '3px 8px',
                                            textAlign: 'left',
                                            fontWeight: 600,
                                            fontSize: 11,
                                            whiteSpace: 'nowrap',
                                            opacity: 0.6,
                                            position: 'relative',
                                            userSelect: 'none',
                                        }}>
                                            {label}
                                            {/* Column resize handle — disabled
                                            {i < COL_LABELS.length - 1 && (
                                                <ColResizeHandle onMouseDown={e => onColResizeMouseDown(e, i)} />
                                            )}
                                            */}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {[...networkRequests].reverse().map(req => {
                                    const isSelected = req.id === selectedId;
                                    return (
                                        <tr
                                            key={req.id}
                                            onClick={() => setSelectedId(isSelected ? null : req.id)}
                                            style={{
                                                cursor: 'pointer',
                                                backgroundColor: isSelected
                                                    ? 'var(--vscode-list-activeSelectionBackground)'
                                                    : 'transparent',
                                                color: isSelected
                                                    ? 'var(--vscode-list-activeSelectionForeground)'
                                                    : 'var(--vscode-foreground)',
                                                borderBottom: '1px solid var(--vscode-panel-border)',
                                            }}
                                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'; }}
                                            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                        >
                                            <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', opacity: 0.7 }}>{formatTimestamp(req.timestamp)}</td>
                                            <td style={{ padding: '4px 8px', fontWeight: 700, color: METHOD_COLORS[req.method] ?? 'var(--vscode-foreground)', whiteSpace: 'nowrap' }}>
                                                {req.method}
                                            </td>
                                            <td style={{ padding: '4px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.9 }}
                                                title={req.url}>
                                                {req.url}
                                            </td>
                                            <td style={{ padding: '4px 8px', fontWeight: 600, color: statusColor(req.status), whiteSpace: 'nowrap' }}>
                                                {req.status || '—'}
                                            </td>
                                            <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', opacity: 0.8 }}>
                                                {formatDuration(req.durationMs)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Detail pane */}
                {selectedReq && (
                    <RequestDetail req={selectedReq} onClose={() => setSelectedId(null)} />
                )}
            </div>
        </div>
    );
}

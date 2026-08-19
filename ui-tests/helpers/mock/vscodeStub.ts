/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A minimal in-memory stand-in for the `vscode` module.
 *
 * Extension-host UI classes (tree items) can only be exercised outside VS Code if `vscode`
 * resolves to something. The stub deliberately records rather than renders: a `ThemeIcon`
 * keeps its id and colour, a `MarkdownString` keeps its text, so a test can assert what the
 * host *would* show without a running editor.
 *
 * Only the surface the tree items actually touch is modelled. Anything else is intentionally
 * absent so an unexpected dependency fails loudly instead of silently passing.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Module = require('module');

export class StubThemeColor {
    public constructor(public readonly id: string) { }
}

export class StubThemeIcon {
    public constructor(public readonly id: string, public readonly color?: StubThemeColor) { }
}

export class StubMarkdownString {
    public isTrusted = false;
    public supportThemeIcons = false;
    public constructor(public value: string = '') { }
    public appendMarkdown(value: string): this {
        this.value += value;
        return this;
    }
}

export class StubTreeItem {
    public id?: string;
    public description?: string | boolean;
    public tooltip?: string | StubMarkdownString;
    public iconPath?: unknown;
    public contextValue?: string;
    public command?: { command: string; title: string; arguments?: unknown[] };
    public resourceUri?: unknown;
    public constructor(public label: string, public collapsibleState: number = 0) { }
}

export const stubTreeItemCollapsibleState = {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the vscode enum
    None: 0,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the vscode enum
    Collapsed: 1,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the vscode enum
    Expanded: 2,
} as const;

/** Records every command execution a unit under test requested. */
export interface ExecutedCommand { command: string; args: unknown[] }

export interface VscodeStub {
    /* eslint-disable @typescript-eslint/naming-convention -- these mirror vscode's exported names */
    ThemeColor: typeof StubThemeColor;
    ThemeIcon: typeof StubThemeIcon;
    MarkdownString: typeof StubMarkdownString;
    TreeItem: typeof StubTreeItem;
    TreeItemCollapsibleState: typeof stubTreeItemCollapsibleState;
    EventEmitter: new () => { event: (listener: (e: unknown) => void) => { dispose(): void }; fire(e?: unknown): void; dispose(): void };
    Uri: { parse(value: string): { toString(): string }; file(value: string): { toString(): string } };
    /* eslint-enable @typescript-eslint/naming-convention */
    l10n: { t(message: string, ...args: unknown[]): string };
    commands: { executeCommand(command: string, ...args: unknown[]): Promise<unknown> };
    window: {
        showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;
        showWarningMessage(message: string, ...items: string[]): Promise<string | undefined>;
        showErrorMessage(message: string, ...items: string[]): Promise<string | undefined>;
        createOutputChannel(name: string): { appendLine(v: string): void; append(v: string): void; show(): void; dispose(): void };
    };
    /** Test-only: every `commands.executeCommand` call, in order. */
    executed: ExecutedCommand[];
}

function createStub(): VscodeStub {
    const executed: ExecutedCommand[] = [];
    return {
        /* eslint-disable @typescript-eslint/naming-convention -- these mirror vscode's exported names */
        ThemeColor: StubThemeColor,
        ThemeIcon: StubThemeIcon,
        MarkdownString: StubMarkdownString,
        TreeItem: StubTreeItem,
        TreeItemCollapsibleState: stubTreeItemCollapsibleState,
        EventEmitter: class {
            public event = (): { dispose(): void } => ({ dispose: () => { /* no-op */ } });
            public fire(): void { /* no-op */ }
            public dispose(): void { /* no-op */ }
        },
        Uri: {
            parse: (value: string) => ({ toString: () => value }),
            file: (value: string) => ({ toString: () => value }),
        },
        /* eslint-enable @typescript-eslint/naming-convention */
        // `vscode.l10n.t` returns the source string when no bundle is loaded, which is exactly
        // what the host does at development time — so assertions read the authored English.
        l10n: { t: (message: string) => message },
        commands: {
            executeCommand: async (command: string, ...args: unknown[]) => {
                executed.push({ command, args });
                return undefined;
            },
        },
        window: {
            showInformationMessage: async () => undefined,
            showWarningMessage: async () => undefined,
            showErrorMessage: async () => undefined,
            createOutputChannel: () => ({
                appendLine: () => { /* no-op */ },
                append: () => { /* no-op */ },
                show: () => { /* no-op */ },
                dispose: () => { /* no-op */ },
            }),
        },
        executed,
    };
}

let installed: VscodeStub | undefined;

/**
 * Make `require('vscode')` resolve to the stub for the rest of this Node process.
 *
 * Must be called *before* the module under test is loaded, so importers of this helper have to
 * pull the unit under test in with a lazy `require` rather than a hoisted `import`.
 */
export function installVscodeStub(): VscodeStub {
    if (installed) { return installed; }
    const stub = createStub();
    const moduleAny = Module as unknown as { _load(request: string, parent: unknown, isMain: boolean): unknown };
    const originalLoad = moduleAny._load;
    moduleAny._load = function (request: string, parent: unknown, isMain: boolean): unknown {
        if (request === 'vscode') { return stub; }
        return originalLoad.call(this, request, parent, isMain);
    };
    installed = stub;
    return stub;
}

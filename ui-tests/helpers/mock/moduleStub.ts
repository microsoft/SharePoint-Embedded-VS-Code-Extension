/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Narrowly scoped CommonJS module substitution for extension-host unit tests.
 *
 * `vscodeStub` makes `require('vscode')` resolvable; this helper goes one step further and
 * lets a test replace a *specific* dependency of a *specific* module — for example, the Graph
 * provider that `StorageExplorerHandoff` reaches for. Command modules pull in singletons that
 * expect a running extension host, so exercising their decision logic outside VS Code is only
 * possible if those edges can be stood in for.
 *
 * The substitution is deliberately keyed by **both** the importing file and the imported
 * specifier. A registry keyed by module id alone would leak across spec files sharing a
 * Playwright worker process and could silently hollow out an unrelated suite's unit under
 * test; requiring the parent to match keeps the blast radius to the module under test.
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */

// eslint-disable-next-line @typescript-eslint/naming-convention -- CommonJS module machinery
const Module = require('module');

interface Substitution {
    parentSuffix: string;
    requestSuffix: string;
    exports: unknown;
}

const substitutions: Substitution[] = [];
let hookInstalled = false;

function normalize(value: string): string {
    return value.replace(/\\/g, '/');
}

function installHook(): void {
    if (hookInstalled) { return; }
    hookInstalled = true;

    const moduleAny = Module as unknown as {
        _load(request: string, parent: { filename?: string } | undefined, isMain: boolean): unknown;
    };
    const originalLoad = moduleAny._load;

    moduleAny._load = function (request: string, parent: { filename?: string } | undefined, isMain: boolean): unknown {
        const parentFile = normalize(parent?.filename ?? '');
        const requested = normalize(request);
        const match = substitutions.find(
            (candidate) => parentFile.endsWith(candidate.parentSuffix) && requested.endsWith(candidate.requestSuffix)
        );
        if (match) { return match.exports; }
        return originalLoad.call(this, request, parent, isMain);
    };
}

/**
 * Replace what `parentSuffix` receives when it imports `requestSuffix`.
 *
 * Both are matched as path suffixes against the importer's filename and the authored
 * specifier, so `mockModuleFor('ContainerType/StorageExplorerHandoff.ts',
 * 'services/Graph/GraphProvider', stub)` affects that one import edge and nothing else.
 *
 * Must be called before the module under test is loaded, so callers require it lazily.
 */
export function mockModuleFor(parentSuffix: string, requestSuffix: string, exports: unknown): void {
    installHook();
    substitutions.push({
        parentSuffix: normalize(parentSuffix),
        requestSuffix: normalize(requestSuffix),
        exports,
    });
}

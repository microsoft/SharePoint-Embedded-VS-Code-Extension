/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContainerTypeAppPermission } from '../models/schemas';

/**
 * Delegated permissions the 1P extension app needs on a container type to perform
 * container operations (create, list, read, write, delete).
 *
 * Kept in its own module — free of `vscode` and of any provider singletons — so the
 * standalone webview harness and the Node-only test suites can import it without
 * dragging in the extension host.
 */
export const REQUIRED_DELEGATED_PERMISSIONS: ContainerTypeAppPermission[] = [
    'readContent',
    'writeContent',
    'create',
    'delete',
    'read',
    'write'
];

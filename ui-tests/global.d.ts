/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Ambient globals for the ui-tests compilation. The API-layer specs import webview-ui service
 * source, which references `window.__STORAGE_EXPLORER_STATE__` (declared in the webview app's
 * context module that isn't pulled into this project). Re-declare the shape here so the
 * ui-tests type-check is self-contained.
 */
interface Window {
    __STORAGE_EXPLORER_STATE__?: {
        appName: string;
        tenantDomain: string;
        containerTypeId: string;
        registrationId: string;
        initialToken?: string;
    };
    __SPE_TEST_TOKEN__?: string;
    acquireVsCodeApi?: () => { postMessage: (message: unknown) => void };
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Simple logger with a global on/off switch.
 *
 * - `Logger.log()` and `Logger.warn()` respect the `enabled` flag.
 * - `Logger.error()` always logs (errors should never be silenced).
 *
 * Toggle at startup or any time:
 *   Logger.enabled = false; // silence all non-error logs
 */
export class Logger {
    /** Set to false to silence all non-error logging. */
    public static enabled = true;

    static log(message: string, ...args: any[]): void {
        if (Logger.enabled) {
            console.log(message, ...args);
        }
    }

    static warn(message: string, ...args: any[]): void {
        if (Logger.enabled) {
            console.warn(message, ...args);
        }
    }

    /** Always logs — errors should never be silenced. */
    static error(message: string, ...args: any[]): void {
        console.error(message, ...args);
    }
}

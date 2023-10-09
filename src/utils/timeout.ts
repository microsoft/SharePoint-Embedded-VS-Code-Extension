/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function timeoutForSeconds(seconds: number) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}
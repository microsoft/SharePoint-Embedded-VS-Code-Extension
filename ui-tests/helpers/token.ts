/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Build a syntactically-valid (unsigned) JWT with Microsoft Graph claims. */
export function makeFakeGraphJwt(): string {
    const now = Math.floor(Date.now() / 1000);
    // Standard base64 (atob-decodable, which the webview's token validator uses).
    const b64 = (o: object): string => Buffer.from(JSON.stringify(o)).toString('base64');
    const header = { alg: 'none', typ: 'JWT' };
    const payload = {
        aud: 'https://graph.microsoft.com',
        iss: 'https://sts.windows.net/mock-tenant/',
        nbf: now - 60,
        exp: now + 3600,
        appid: 'spe-ui-test',
    };
    return `${b64(header)}.${b64(payload)}.sig`;
}

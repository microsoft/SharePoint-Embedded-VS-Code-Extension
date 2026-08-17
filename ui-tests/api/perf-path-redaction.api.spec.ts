/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { templatizeGraphPath } from '../../src/utils/perfPathRedaction';

const GUID_A = '7ea50786-b9d6-4f9f-be54-d41e52634a0b';
const GUID_B = '794cf0d3-8321-428b-9771-d1282b15ce00';

test.describe('templatizeGraphPath — identifiers are removed', () => {
    test('replaces every GUID, including the reported permission-grant path', () => {
        expect(templatizeGraphPath(
            `/v1.0/storage/fileStorage/containerTypeRegistrations/${GUID_A}/applicationPermissionGrants/${GUID_B}`
        )).toBe('/v1.0/storage/fileStorage/containerTypeRegistrations/{id}/applicationPermissionGrants/{id}');
    });

    test('replaces uppercase GUIDs', () => {
        expect(templatizeGraphPath(`/v1.0/storage/fileStorage/containerTypes/${GUID_A.toUpperCase()}`))
            .toBe('/v1.0/storage/fileStorage/containerTypes/{id}');
    });

    test('replaces SPE composite container and drive ids', () => {
        expect(templatizeGraphPath('/v1.0/storage/fileStorage/containers/b!abcDEF123_-xyz/permissions'))
            .toBe('/v1.0/storage/fileStorage/containers/{id}/permissions');
        expect(templatizeGraphPath('/v1.0/sites/contoso.sharepoint.com,abc-123,def-456/drive'))
            .toBe('/v1.0/sites/{id}/drive');
    });

    test('replaces drive item ids', () => {
        expect(templatizeGraphPath('/v1.0/drives/b!xyz!123/items/01BYE5RZ6QN3ZWBTUFOFD3GSPGOHDJD36K/content'))
            .toBe('/v1.0/drives/{id}/items/{id}/content');
    });

    test('replaces user principal names', () => {
        expect(templatizeGraphPath('/v1.0/users/alice.smith@contoso.onmicrosoft.com'))
            .toBe('/v1.0/users/{upn}');
    });

    test('replaces user-authored file paths and names', () => {
        expect(templatizeGraphPath('/v1.0/drives/b!x/root:/Board Reports/Q3 Revenue.xlsx:/content'))
            .toBe('/v1.0/drives/{id}/root:/{path}/content');
        expect(templatizeGraphPath('/v1.0/drives/b!x/root:/Board Reports/Q3 Revenue.xlsx'))
            .toBe('/v1.0/drives/{id}/root:/{path}');
        expect(templatizeGraphPath('/v1.0/drives/b!x/items/01ABCDEFGHIJKLMNOPQRST/Contract.docx'))
            .toBe('/v1.0/drives/{id}/items/{id}/{name}');
    });

    test('replaces percent-encoded names', () => {
        expect(templatizeGraphPath('/v1.0/drives/b!x/root:/My%20Folder:/children'))
            .toBe('/v1.0/drives/{id}/root:/{path}/children');
    });

    test('leaves no GUID anywhere in the output', () => {
        const templated = templatizeGraphPath(
            `/v1.0/storage/fileStorage/containerTypeRegistrations/${GUID_A}/applicationPermissionGrants/${GUID_B}`
        );
        expect(templated).not.toContain(GUID_A);
        expect(templated).not.toContain(GUID_B);
        expect(/[0-9a-f]{8}-[0-9a-f]{4}/i.test(templated)).toBe(false);
    });
});

test.describe('templatizeGraphPath — route shape is preserved', () => {
    const routeSegments = [
        'storage', 'fileStorage', 'containers', 'containerTypes', 'containerTypeRegistrations',
        'applicationPermissionGrants', 'deletedContainers', 'customProperties', 'recycleBin',
        'permissions', 'columns', 'activate', 'restore', 'permanentDelete', 'children',
        'content', 'versions', 'drive', 'drives', 'items', 'root', 'me', 'users', 'groups'
    ];

    for (const segment of routeSegments) {
        test(`keeps "${segment}"`, () => {
            expect(templatizeGraphPath(`/v1.0/${segment}`)).toBe(`/v1.0/${segment}`);
        });
    }

    test('keeps API version segments', () => {
        expect(templatizeGraphPath('/v1.0/me')).toBe('/v1.0/me');
        expect(templatizeGraphPath('/beta/me')).toBe('/beta/me');
    });

    test('keeps OData function and action segments', () => {
        expect(templatizeGraphPath('/v1.0/$batch')).toBe('/v1.0/$batch');
        expect(templatizeGraphPath('/v1.0/drives/b!x/items/01ABCDEFGHIJKLMNOPQRST/createLink'))
            .toBe('/v1.0/drives/{id}/items/{id}/createLink');
    });

    test('handles empty and root paths', () => {
        expect(templatizeGraphPath('')).toBe('');
        expect(templatizeGraphPath('/')).toBe('/');
    });
});

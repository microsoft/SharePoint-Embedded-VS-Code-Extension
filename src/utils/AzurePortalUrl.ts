/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class AzurePortalUrlProvider {
    public static readonly PORTAL_URL: string = 'https://portal.azure.com';

    public static getAppRegistrationUrl(appId: string): string {
        return `${AzurePortalUrlProvider.PORTAL_URL}/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Overview/appId/${appId}`;
    }
}
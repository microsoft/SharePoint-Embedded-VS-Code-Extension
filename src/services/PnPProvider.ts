/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

let sp: any = null;

export async function getPnPProvider(accessToken: any, tenantName: any) {

    if (typeof sp !== "undefined" && sp !== null) {
        return sp;
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { spfi, DefaultInit, DefaultHeaders, SPFI } = await import("@pnp/sp/index.js");
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { DefaultParse, BearerToken } = await import("@pnp/queryable/index.js");
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { NodeFetchWithRetry } = await import("@pnp/nodejs/index.js");
    await import("@pnp/sp/webs/index.js");
    await import("@pnp/sp-admin/index.js");

    sp = spfi(`https://${tenantName}-admin.sharepoint.com/`).using(
        BearerToken(accessToken),
        DefaultHeaders(),
        DefaultInit(),
        NodeFetchWithRetry(),
        DefaultParse()
    );

    return sp;
}
export default class PnPProvider {
    async createNewContainerType(accessToken: any, tenantName: any, owningAppId: string) {
        try {
            let sp: any;
            try {
                sp = await getPnPProvider(accessToken, tenantName)
            } catch (e) {
                console.log(e);
                throw e;
            }

            // Accept Terms of Service for SharePoint Embedded Services prior to management calls
            // try {
            //     await sp.admin.tenant.call("AcceptSyntexRepositoryTermsOfService")
            // } catch (error: any) {
            //     console.log(error.message);
            //     throw error;
            // }

            let containerTypeProperties;
            try {
                containerTypeProperties = await sp.admin.tenant.call("NewSPOContainerType", {
                    containerTypeProperties: {
                        DisplayName: "SharePoint Embedded VS Code Extension CT",
                        OwningAppId: owningAppId,
                        SPContainerTypeBillingClassification: 1
                    }
                });
            } catch (error: any) {
                console.log(error.message);
                throw error;
            }
            console.log(JSON.stringify(containerTypeProperties, null, 4));
            return containerTypeProperties;
        } catch (error: any) {
            console.log(error)
            throw error;
        }
    }
}


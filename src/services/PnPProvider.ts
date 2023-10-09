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
            }

            let c;
            try {
                c = await sp.admin.tenant.call("NewSPOContainerType", {
                    containerTypeProperties: {
                        DisplayName: "PnPTest",
                        OwningAppId: owningAppId
                    }
                });

                // c = await sp.admin.tenant();

            } catch (e: any) {
                console.log(e.message);
            }
            console.log(JSON.stringify(c, null, 4));
            return c;
        } catch (e: any) {
            console.log(e)
        }
    }
}


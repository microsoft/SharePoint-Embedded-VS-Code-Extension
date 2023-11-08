/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { BillingClassification } from '../models/ContainerType';
let sp: any = null;

async function getPnPProvider(accessToken: any, tenantName: any) {

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
    static async createNewContainerType(accessToken: any, tenantName: any, owningAppId: string, displayName: string, billingClassification: BillingClassification) {
        try {
            let sp: any;
            try {
                sp = await getPnPProvider(accessToken, tenantName)
            } catch (e) {
                console.log(e);
                throw e;
            }

            let containerTypeProperties;
            try {
                containerTypeProperties = await sp.admin.tenant.call("NewSPOContainerType", {
                    containerTypeProperties: {
                        DisplayName: displayName,
                        OwningAppId: owningAppId,
                        SPContainerTypeBillingClassification: billingClassification
                    }
                });
            } catch (error: any) {
                if (error.response && error.response.status === 500) {
                    const errorMessage = error.message;
                    if (errorMessage.includes("Maximum number of allowed Trial Container Types has been exceeded.")) {
                        throw new Error("Maximum number of allowed Trial Container Types has been exceeded.")
                    } else if (errorMessage.inclues("")) {
                        throw new Error("Maximum number of allowed Trial Container Types has been exceeded.")
                    }
                }
                else if (error.response && error.response.status === 400) {
                    const errorMessage = error.message;
                    if (errorMessage.includes("Accept the terms of service in SharePoint admin center to continue")) {
                        throw new Error("SharePoint Embedded Terms of Service have not been accepted. Visit https://aka.ms/enable-spe")
                    }
                } else {
                    throw new Error(error.message);
                }
            }

            console.log(JSON.stringify(containerTypeProperties, null, 4));
            return containerTypeProperties;
        } catch (error: any) {
            throw error;
        }
    }

    static async getContainerTypes(accessToken: any, tenantName: string) {
        try {
            let sp: any;
            try {
                sp = await getPnPProvider(accessToken, tenantName)
            } catch (e) {
                console.log(e);
                throw e;
            }

            try {
                return await sp.admin.tenant.call("GetSPOContainerTypes", {
                    containerTenantType: 1
                })
            } catch (error: any) {
                console.log(error.message);
                throw error;
            }
        } catch (error: any) {
            throw error;
        }
    }   

    static async getContainerTypeById(accessToken: any, tenantName: string, containerTypeId: string) {
        try {
            let sp: any;
            try {
                sp = await getPnPProvider(accessToken, tenantName)
            } catch (e) {
                console.log(e);
                throw e;
            }

            try {
                return await sp.admin.tenant.call("GetSPOContainerTypeById", {
                    containerTypeId: containerTypeId,
                    containerTenantType: 1
                })
            } catch (error: any) {
                console.log(error.message);
                throw error;
            }
        } catch (error: any) {
            throw error;
        }
    }

    static async deleteContainerTypeById(accessToken: any, tenantName: string, containerTypeId: string) {
        try {
            let sp: any;
            try {
                sp = await getPnPProvider(accessToken, tenantName)
            } catch (e) {
                console.log(e);
                throw e;
            }

            // Accept Terms of Service for SharePoint Embedded Services prior to management calls
            try {
                const result = await sp.admin.tenant.call("DeleteSPOContainerTypeById", {
                    containerTypeId: containerTypeId
                })
                return result;
            } catch (error: any) {
                console.log(error.message);
                throw error;
            }
        } catch (error: any) {
            throw error;
        }
    }

    static async acceptSpeTos(accessToken: any, tenantName: any, owningAppId: string) {
        try {
            let sp: any;
            try {
                sp = await getPnPProvider(accessToken, tenantName)
            } catch (e) {
                console.log(e);
                throw e;
            }

            // Accept Terms of Service for SharePoint Embedded Services prior to management calls
            try {
                await sp.admin.tenant.call("AcceptSyntexRepositoryTermsOfService")
            } catch (error: any) {
                console.log(error.message);
                throw error;
            }
        } catch (error: any) {
            throw error;
        }
    }
}


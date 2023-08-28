// import { NodeFetchWithRetry } from "@pnp/nodejs";
// import "@pnp/sp/webs/index.js";
// import { BearerToken } from "@pnp/queryable";
// import { spfi, DefaultInit, DefaultHeaders } from "@pnp/sp";
// import { DefaultParse } from "@pnp/queryable";
// import "@pnp/sp-admin";
// import "@pnp/sp/webs/index.js";

// export default class PnPProvider {
//     async createNewContainerType(accessToken: any, tenantName: any) {
//         let sp: any;
//         try {
//             sp = spfi('https://a830edad9050849alexpnp-admin.sharepoint.com/').using(
//                 BearerToken(accessToken),
//                 DefaultHeaders(),
//                 DefaultInit(),
//                 NodeFetchWithRetry(),
//                 DefaultParse()
//             );
//         } catch (e) {
//             console.log(e);
//         }

//         let c;
//         try {
//             // c = await sp.admin.tenant.call("NewSPOContainerType", {
//             //     containerTypeProperties: {
//             //         DisplayName: "PnPTest",
//             //         OwningAppId: "01dda778-ac0f-4c31-b3f3-b15e06f64f5d"
//             //     }
//             // });

//             c = await sp.admin.tenant();

//         } catch (e: any) {
//             console.log(e.message);
//         }
//         console.log(JSON.stringify(c, null, 4));
//     }
// }


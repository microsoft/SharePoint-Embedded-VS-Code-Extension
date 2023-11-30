import { StorageProvider } from "../services/StorageProvider";
import { TenantDomain } from "./constants";

export class TermsOfServiceError extends Error {
    constructor() {
        const domain = StorageProvider.get().global.getValue(TenantDomain);
        const message =  `You will need to enable SharePoint repository services on your tenant before you can create a Container Type.
        You can do that in the [SharePoint Admin Center Settings page](https://${domain}-admin.sharepoint.com/_layouts/15/online/AdminHome.aspx#/settings).\n
        [Learn more](https://aka.ms/enable-spe)`;
        super(message);
        this.name = 'TermsOfServiceError';
        this.message = message;
    }
}
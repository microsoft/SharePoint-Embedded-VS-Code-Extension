/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import jwt_decode from "jwt-decode";

export function checkJwtForAdminClaim(acccesToken: string): boolean {
    try {
        const decodedToken: any = jwt_decode(acccesToken);
    
        // Check if 'wids' property exists and if its value is the desired string
        if (decodedToken.wids && Array.isArray(decodedToken.wids) && decodedToken.wids.includes("62e90394-69f5-4237-9190-012177145e10")) {
          return true;
        } else {
          return false;
        }
      } catch (error) {
        console.error("Error decoding JWT token:", error);
        throw error;
      }

}
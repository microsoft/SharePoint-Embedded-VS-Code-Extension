/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import jwt_decode from "jwt-decode";
const globalAdminGuid = "62e90394-69f5-4237-9190-012177145e10";

export function checkJwtForAdminClaim(decodedToken: any): boolean {
    try {    
        // Check if 'wids' property exists and if its value is the desired string
        if (decodedToken.wids && Array.isArray(decodedToken.wids) && decodedToken.wids.includes(globalAdminGuid)) {
          return true;
        } else {
          return false;
        }
      } catch (error) {
        console.error("Error decoding JWT token:", error);
        throw error;
      }

}

export function getJwtTenantId(decodedToken: any): string | undefined {
  return decodedToken.tid;
} 

export function decodeJwt(accessToken: string): any {
  try {
    return jwt_decode(accessToken);
  } catch (error) {
    console.error("Error decoding JWT token:", error);
    throw error;
  }
}
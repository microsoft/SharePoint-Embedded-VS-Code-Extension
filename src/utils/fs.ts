/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as http from 'http';

export function sendFile(res: http.ServerResponse, filepath: string, contentType: string) {
    fs.readFile(filepath, (err, body) => {
      if (err) {
      } else {
        res.writeHead(200, {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          "Content-Length": body.length,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          "Content-Type": contentType,
        });
        res.end(body);
      }
    });
  }
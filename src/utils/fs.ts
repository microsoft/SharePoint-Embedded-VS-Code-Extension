/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as http from 'http';

export function sendFile(res: http.ServerResponse, filepath: string, contentType: string) {
    fs.readFile(filepath, (err, body) => {
      if (err) {
        console.error(err.message);
      } else {
        res.writeHead(200, {
          "Content-Length": body.length,
          "Content-Type": contentType,
        });
        res.end(body);
      }
    });
  }
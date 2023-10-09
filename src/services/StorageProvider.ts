/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import { Memento } from "vscode";

export class LocalStorageService {
    
    constructor(private storage: Memento) { }   
    
    public getValue<T>(key : string) : T{
        return this.storage.get<T>(key, null as unknown as T);
    }

    public setValue<T>(key : string, value : T){
        this.storage.update(key, value );
    }
}
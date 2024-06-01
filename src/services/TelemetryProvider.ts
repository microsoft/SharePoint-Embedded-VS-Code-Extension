/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import TelemetryReporter from '@vscode/extension-telemetry';
import { telemetryKey } from '../client';
import { v4 as uuidv4 } from 'uuid';
import { Account } from '../models/Account';
import { TelemetryEvent, TelemetryErrorEvent } from '../models/telemetry/telemetry';
import { StorageProvider } from './StorageProvider';

export class TelemetryProvider {
    public static readonly instance: TelemetryProvider = new TelemetryProvider(); 
    private reporter: TelemetryReporter;
    private _sessionId;
    private _sessionStartTime;

    public constructor() {
        this.reporter = new TelemetryReporter(telemetryKey);
        this._sessionId = uuidv4();
        this._sessionStartTime = Date.now();
    }

    public getTelemetryInstallationId(): string {
        const storageKey = 'SharePointEmbeddedTelemetryInstallationId';
        let installationId: string = StorageProvider.get().global.getValue(storageKey);
        if (!installationId) {
            installationId = uuidv4();
            StorageProvider.get().global.setValue(storageKey, installationId);
        }
        return installationId;
    }

    public async send(ev: TelemetryEvent): Promise<void> {
        ev.addProperty("telemetryInstallationId", this.getTelemetryInstallationId());
        const account = Account.get();
        if (account) {  
            ev.addProperty("telemetryUserId", await account.getTelemetryUserId());
            ev.addProperty("telemetryTenantId", await account.getTelemetryTenantId());
        }
        if (ev instanceof TelemetryErrorEvent) {
            this.sendTelemetryErrorEvent(ev);
        } else {
            this.sendTelemetryEvent(ev);
        }
    } 

    public sendTelemetryEvent(ev: TelemetryEvent): void {
        if (this.reporter) {
            ev.addProperty("sessionId", this._sessionId);      
            ev.addProperty("sessionDurationMinutes", ((Date.now() - this._sessionStartTime) / 60000).toString());
            this.reporter.sendTelemetryEvent(ev.name, ev.properties);
        }
    }

    public sendTelemetryErrorEvent(ev: TelemetryErrorEvent): void {
        if (this.reporter) {
            ev.addProperty("sessionId", this._sessionId);      
            ev.addProperty("sessionDurationMinutes", ((Date.now() - this._sessionStartTime) / 60000).toString());
            this.reporter.sendTelemetryErrorEvent(ev.name, ev.properties);
        }
    }

    public dispose() {
        if (this.reporter) {
            this.reporter.dispose();
        }
    }
}
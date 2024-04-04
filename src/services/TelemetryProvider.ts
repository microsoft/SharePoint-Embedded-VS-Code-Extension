import TelemetryReporter from '@vscode/extension-telemetry';
import { telemetryKey } from '../client';
import { md5 } from 'node-forge';
import { v4 as uuidv4 } from 'uuid';
import { Account } from '../models/Account';
import { TelemetryEvent, TelemetryErrorEvent } from '../models/telemetry/telemetry';

class TelemetryProvider {
    public static readonly instance: TelemetryProvider = new TelemetryProvider(); 
    private reporter: TelemetryReporter;

    public constructor() {
        this.reporter = new TelemetryReporter(telemetryKey);
    }

    public send(ev: TelemetryEvent): void {
        const account = Account.get();
        if (account) {
            let needsSave = false;
            if (!account.telemetryUserId) {
                account.telemetryUserId = uuidv4();
                needsSave = true;
            }

            if (needsSave) {
                account.saveToStorage();
            }
            ev.addProperty("telemetryUserId", account.telemetryUserId);
        }
        if (ev instanceof TelemetryErrorEvent) {
            this.sendTelemetryErrorEvent(ev);
        } else {
            this.sendTelemetryEvent(ev);
        }
    } 


    public sendTelemetryEvent(ev: TelemetryEvent): void {
        if (this.reporter) {
            this.reporter.sendTelemetryEvent(ev.name, ev.properties);
        }
    }

    public sendTelemetryErrorEvent(ev: TelemetryErrorEvent): void {
        if (this.reporter) {
            this.reporter.sendTelemetryErrorEvent(ev.name, ev.properties);
        }
    }

    public dispose() {
        if (this.reporter) {
            this.reporter.dispose();
        }
    }
}

export default TelemetryProvider;
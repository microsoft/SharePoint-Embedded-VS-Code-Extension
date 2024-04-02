import TelemetryReporter from '@vscode/extension-telemetry';
import { telemetryKey } from '../client';

class TelemetryProvider {
    private static instance: TelemetryProvider;
    private reporter: TelemetryReporter | undefined;

    private constructor() {
        this.reporter = new TelemetryReporter(telemetryKey);
    }

    public static init(): TelemetryProvider {
        if (!TelemetryProvider.instance) {
            TelemetryProvider.instance = new TelemetryProvider();
        }
        return TelemetryProvider.instance;
    }

    public static get(): TelemetryProvider {
        if (!TelemetryProvider.instance) {
            throw new Error("TelemetryProvider not yet initialized. Call init() first");
        }
        return TelemetryProvider.instance;
    }

    public sendTelemetryEvent(eventName: string, properties?: { [key: string]: string }, measurements?: { [key: string]: number }) {
        if (this.reporter) {
            this.reporter.sendTelemetryEvent(eventName, properties, measurements);
        }
    }

    public sendTelemetryErrorEvent(eventName: string, properties?: { [key: string]: string }, measurements?: { [key: string]: number }) {
        if (this.reporter) {
            this.reporter.sendTelemetryErrorEvent(eventName, properties, measurements);
        }
    }

    public dispose() {
        if (this.reporter) {
            this.reporter.dispose();
        }
    }
}

export default TelemetryProvider;
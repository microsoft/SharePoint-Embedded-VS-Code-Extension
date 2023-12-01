
import * as vscode from 'vscode';

export abstract class Command {
    public static readonly COMMAND: string;

    public static register(context: vscode.ExtensionContext): void {
        context.subscriptions.push(vscode.commands.registerCommand(this.COMMAND, this.run));
    }

    public static async run(): Promise<void> {
        throw new Error('Not implemented.');
    }
}
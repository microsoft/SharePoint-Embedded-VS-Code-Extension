
import { Command } from './Command';
import * as vscode from 'vscode';
import { Account } from '../models/Account';

// Static class that handles the sign in command
export class SignIn extends Command {
    // Command name
    public static readonly COMMAND = 'login';

    // Command handler
    public static async run(): Promise<void> {
        try {
            vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', true);
            await Account.login();
            vscode.commands.executeCommand('setContext', 'spe:isLoggingIn', false);
        } catch (error) {
            vscode.window.showErrorMessage('Failed to obtain access token.');
            console.error('Error:', error);
        }
    }
}

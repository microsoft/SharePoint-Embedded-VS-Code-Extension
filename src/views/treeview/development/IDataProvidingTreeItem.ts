
import * as vscode from "vscode";

export abstract class IChildrenProvidingTreeItem extends vscode.TreeItem {
    public abstract getChildren(): Thenable<vscode.TreeItem[]>;
}
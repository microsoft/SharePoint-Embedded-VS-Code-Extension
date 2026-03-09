/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainerTypesTreeItem } from "./ContainerTypesTreeItem";
import { ContainerTypeTreeItem } from "./ContainerTypeTreeItem";
import { IChildrenProvidingTreeItem } from "./IDataProvidingTreeItem";
import { AuthenticationState } from "../../../services/AuthenticationState";
import { GraphProvider } from "../../../services/Graph/GraphProvider";

export class DevelopmentTreeViewProvider implements vscode.TreeDataProvider<IChildrenProvidingTreeItem | vscode.TreeItem> {

    public static readonly viewId = "spe-development";

    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined> = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> = this._onDidChangeTreeData.event;

    private _treeView: vscode.TreeView<IChildrenProvidingTreeItem | vscode.TreeItem> | undefined;
    private _rootItems: vscode.TreeItem[] = [];

    // Deduplicates concurrent root-level fetches. Every call to getChildren(undefined)
    // within the same refresh cycle returns the same promise (and therefore the same
    // object references). refresh() clears this so the next cycle re-fetches.
    private _rootFetchPromise: Promise<vscode.TreeItem[]> | undefined;

    // Resolves when the current root fetch completes. revealContainerType() awaits
    // this so it uses the exact same objects that VS Code received from getChildren().
    private _childrenLoaded: Promise<void> | undefined;
    private _resolveChildrenLoaded: (() => void) | undefined;

    private constructor() { }
    private static _instance: DevelopmentTreeViewProvider = new DevelopmentTreeViewProvider();
    public static get instance(): DevelopmentTreeViewProvider {
        return DevelopmentTreeViewProvider._instance;
    }
    public static getInstance() {
        return DevelopmentTreeViewProvider._instance;
    }
    public static resetInstance(): void {
        DevelopmentTreeViewProvider._instance = new DevelopmentTreeViewProvider();
    }

    public setTreeView(treeView: vscode.TreeView<IChildrenProvidingTreeItem | vscode.TreeItem>): void {
        this._treeView = treeView;
    }

    public refresh(element?: vscode.TreeItem): void {
        if (element && element instanceof ContainerTypesTreeItem) {
            element = undefined;
        }
        // Clear cached children so reveal() picks up fresh object references
        for (const item of this._rootItems) {
            if (item instanceof ContainerTypesTreeItem) {
                item.clearChildrenCache();
            }
        }

        // Invalidate the cached root fetch so the next getChildren() re-fetches.
        this._rootFetchPromise = undefined;

        // Create a gate that revealContainerType() can await.
        this._childrenLoaded = new Promise(resolve => {
            this._resolveChildrenLoaded = resolve;
        });

        this._onDidChangeTreeData.fire(element);
    }

    public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    public getParent(element: vscode.TreeItem): vscode.TreeItem | undefined {
        // Root items (ContainerTypesTreeItem) have no parent.
        // Match by id when available to survive object-reference changes after refresh.
        for (const rootItem of this._rootItems) {
            if (element === rootItem || (element.id && element.id === rootItem.id)) {
                return undefined;
            }
        }
        // ContainerTypeTreeItem → parent is ContainerTypesTreeItem
        if (element instanceof ContainerTypeTreeItem) {
            for (const rootItem of this._rootItems) {
                if (rootItem instanceof ContainerTypesTreeItem) {
                    const cached = rootItem.getCachedChildren();
                    if (cached) {
                        const match = cached.some(
                            (child) => child === element || (element.id && child.id === element.id)
                        );
                        if (match) {
                            return rootItem;
                        }
                    }
                }
            }
        }
        return undefined;
    }

    public async getChildren(element?: IChildrenProvidingTreeItem | vscode.TreeItem | undefined): Promise<vscode.TreeItem[]> {
        if (element) {
            if (element instanceof IChildrenProvidingTreeItem) {
                return await element.getChildren();
            } else {
                return Promise.resolve([]);
            }
        }
        // Deduplicate concurrent root-level fetches. If a fetch is already
        // in flight (or completed within this refresh cycle), return the
        // same promise so every caller gets the same object references.
        if (!this._rootFetchPromise) {
            this._rootFetchPromise = this._getChildren();
        }
        return this._rootFetchPromise;
    }

    /**
     * Waits for the tree to load after refresh(), then reveals a container type by ID.
     */
    public async revealContainerType(containerTypeId: string): Promise<boolean> {
        if (!this._treeView) {
            return false;
        }

        // Wait for VS Code's own getChildren() call to complete after refresh.
        // Timeout after 5s in case the tree view is collapsed/hidden and VS Code
        // never calls getChildren(); in that case we load the data ourselves.
        if (this._childrenLoaded) {
            await Promise.race([
                this._childrenLoaded,
                new Promise<void>(resolve => setTimeout(resolve, 5_000))
            ]);
        }

        // If the tree is collapsed or hidden, VS Code may not have called
        // getChildren() yet. Trigger it via the deduplicated path so we
        // still get stable object references if VS Code calls later.
        if (this._rootItems.length === 0) {
            await this.getChildren(undefined);
        }

        for (const item of this._rootItems) {
            if (item instanceof ContainerTypesTreeItem) {
                const ctItem = await item.findContainerTypeById(containerTypeId);
                if (ctItem) {
                    await this._treeView.reveal(ctItem, { expand: true, select: true, focus: true });
                    return true;
                }
            }
        }
        return false;
    }

    private async _getChildren(): Promise<vscode.TreeItem[]> {
        // Check if user is signed in using the new authentication system
        const isSignedIn = await AuthenticationState.isSignedIn();
        if (!isSignedIn) {
            this._rootItems = [];
            this._signalChildrenLoaded();
            return [];
        }

        try {
            const graphProvider = GraphProvider.getInstance();
            const containerTypes = await graphProvider.containerTypes.list();
            if (containerTypes && containerTypes.length > 0) {
                this._rootItems = [new ContainerTypesTreeItem(containerTypes)];
                this._signalChildrenLoaded();
                return this._rootItems;
            }
            await vscode.commands.executeCommand('setContext', 'spe:showGettingStartedView', true);
        } catch {
            await vscode.commands.executeCommand('setContext', 'spe:showFailedView', true);
        }
        this._rootItems = [];
        this._signalChildrenLoaded();
        return [];
    }

    private _signalChildrenLoaded(): void {
        if (this._resolveChildrenLoaded) {
            this._resolveChildrenLoaded();
            this._resolveChildrenLoaded = undefined;
        }
    }
}

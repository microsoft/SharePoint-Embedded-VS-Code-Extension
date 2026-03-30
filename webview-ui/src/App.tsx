import React from 'react';
import { StorageExplorerProvider } from './context/StorageExplorerContext';
import { StorageExplorerPage } from './pages/StorageExplorerPage';

export function App() {
    return (
        <StorageExplorerProvider>
            <StorageExplorerPage />
        </StorageExplorerProvider>
    );
}

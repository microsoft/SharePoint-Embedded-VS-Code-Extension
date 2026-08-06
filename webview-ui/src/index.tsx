import React from 'react';
import ReactDOM from 'react-dom/client';
import '@vscode/codicons/dist/codicon.css';
import './styles/global.css';
import { App } from './App';

const root = document.getElementById('root')!;

async function bootstrap(): Promise<void> {
    // Standalone dev/test harness only: stand up an in-page extension-host emulator so the
    // app's rpc/request messages are answered. Stripped from the production bundle.
    if (import.meta.env.DEV) {
        const token = (window as unknown as Record<string, unknown>).__SPE_TEST_TOKEN__;
        if (typeof token === 'string' && token) {
            const { installTestHost } = await import('./testHost');
            installTestHost({
                containerTypeId: window.__STORAGE_EXPLORER_STATE__?.containerTypeId ?? '',
                token,
            });
        }
    }

    ReactDOM.createRoot(root).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}

void bootstrap();

import React from 'react';
import ReactDOM from 'react-dom/client';
import '@vscode/codicons/dist/codicon.css';
import './styles/global.css';
import { App } from './App';

const root = document.getElementById('root')!;
ReactDOM.createRoot(root).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);

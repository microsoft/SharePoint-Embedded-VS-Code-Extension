import React from 'react';

export function ListLoadingState({ progress = 0 }: { progress?: number }) {
    return (
        <div
            data-testid="list-loading"
            onClick={(event) => event.stopPropagation()}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: 12,
                opacity: 0.7,
            }}
        >
            <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 32 }} />
            <span style={{ fontSize: 13 }}>
                {progress > 0 ? `Loading… ${progress.toLocaleString()} items so far` : 'Loading…'}
            </span>
        </div>
    );
}

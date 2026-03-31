import React, { useState, useRef, useEffect } from 'react';

export const COL_RESIZE_MIN_WIDTH = 44;

/**
 * Manages an array of resizable column pixel widths.
 * Layout-agnostic — works with CSS grid (FileList) or HTML table (NetworkDrawer).
 */
export function useResizableColumns(initialWidths: number[], minWidth = COL_RESIZE_MIN_WIDTH) {
    const [colWidths, setColWidths] = useState<number[]>(initialWidths);
    const dragRef = useRef<{ idx: number; startX: number; startW: number; direction: number } | null>(null);

    useEffect(() => {
        function onMove(e: MouseEvent) {
            if (!dragRef.current) return;
            const { idx, startX, startW, direction } = dragRef.current;
            const delta = (e.clientX - startX) * direction;
            setColWidths(prev => {
                const next = [...prev];
                next[idx] = Math.max(minWidth, startW + delta);
                return next;
            });
        }
        function onUp() { dragRef.current = null; }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
    }, [minWidth]);

    function onColResizeMouseDown(e: React.MouseEvent, idx: number, direction: number = 1) {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = { idx, startX: e.clientX, startW: colWidths[idx], direction };
    }

    return { colWidths, onColResizeMouseDown };
}

/** Drag handle rendered inside a position:relative header cell. */
export function ColResizeHandle({ onMouseDown, side = 'right' }: { onMouseDown: (e: React.MouseEvent) => void; side?: 'left' | 'right' }) {
    return (
        <div
            onMouseDown={onMouseDown}
            style={{
                position: 'absolute',
                [side]: 0,
                top: 0,
                bottom: 0,
                width: 5,
                cursor: 'col-resize',
                zIndex: 1,
                backgroundColor: 'transparent',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--vscode-focusBorder)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        />
    );
}

import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

export const FEATURE_EDITOR = 'spe_edit_file';
const maxBytes = 512 * 1024;

export function featureEditor(root: string, canWrite: (file: string) => boolean, canEdit: () => boolean) {
    return {
        name: FEATURE_EDITOR,
        description: 'Edit a UTF-8 worktree file by replacing one unique exact text match. Set oldText to an empty string only to create a new file.',
        parameters: {
            type: 'object',
            properties: { file: { type: 'string' }, oldText: { type: 'string' }, newText: { type: 'string' } },
            required: ['file', 'oldText', 'newText'],
            additionalProperties: false,
        },
        async handler(args: { file: string; oldText: string; newText: string }) {
            const { file: requested, oldText, newText } = args ?? {};
            const file = typeof requested === 'string' ? worktreeFile(root, requested) : undefined;
            if (!canEdit() || !file || typeof oldText !== 'string' || typeof newText !== 'string' ||
                [oldText, newText].some(text => Buffer.byteLength(text) > maxBytes || text.includes('\0')) || !canWrite(file)) {
                throw new Error('Edit is outside the authorized worktree or has invalid arguments.');
            }
            const parts = file.split('/');
            const filename = parts.pop()!;
            let parent = await realpath(root);
            for (const part of parts) {
                parent = path.join(parent, part);
                let info = await statIfPresent(parent);
                if (!info && !oldText) {
                    await mkdir(parent);
                    info = await lstat(parent);
                }
                if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error('Edit requires a regular worktree directory.');
            }
            const target = path.join(parent, filename);
            if (!oldText) {
                await writeFile(target, newText, { encoding: 'utf8', flag: 'wx' });
                return 'Created file.';
            }
            const info = await lstat(target);
            if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > maxBytes) {
                throw new Error('Edit requires a regular, unlinked text file of at most 512 KiB.');
            }
            const data = await readFile(target);
            const text = data.toString('utf8');
            if (text.includes('\0') || !Buffer.from(text).equals(data)) throw new Error('Edit requires UTF-8 text.');
            const needle = text.includes('\r\n') ? oldText.replace(/\r?\n/g, '\r\n') : oldText;
            const replacement = text.includes('\r\n') ? newText.replace(/\r?\n/g, '\r\n') : newText;
            const offset = text.indexOf(needle);
            if (offset < 0 || offset !== text.lastIndexOf(needle)) throw new Error('oldText must match exactly once.');
            const updated = text.slice(0, offset) + replacement + text.slice(offset + needle.length);
            if (Buffer.byteLength(updated) > maxBytes) throw new Error('Edited file would exceed 512 KiB.');
            await writeFile(target, updated, 'utf8');
            return 'Updated file.';
        },
    };
}

function worktreeFile(root: string, requested: string): string | undefined {
    const native = process.platform === 'win32' ? requested.replaceAll('/', '\\') : requested;
    if (native.split(path.sep).some(part => part === '.' || part === '..')) return undefined;
    const relative = path.isAbsolute(native) ? path.relative(root, native) : native;
    const file = relative.split(path.sep).join('/');
    if (!/^[a-zA-Z0-9._/-]+$/.test(file) || file.split('/').some(part =>
        !part || part.endsWith('.') || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) return undefined;
    return file;
}

async function statIfPresent(file: string) {
    try {
        return await lstat(file);
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
        throw error;
    }
}

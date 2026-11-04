import * as path from 'node:path';

export function normalizeRepositoryPath(value: string): string {
    return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function globMatches(pattern: string, candidate: string): boolean {
    const normalizedPattern = normalizeRepositoryPath(pattern);
    const normalizedCandidate = normalizeRepositoryPath(candidate);
    return globToRegExp(normalizedPattern).test(normalizedCandidate);
}

export function matchesAny(patterns: string[], candidate: string): boolean {
    return patterns.some(pattern => globMatches(pattern, candidate));
}

export function assertChangedPathsAllowed(
    changedPaths: string[],
    globalAllowed: string[],
    workerAllowed: string[],
    denied: string[]
): void {
    const violations = changedPaths.filter(changedPath => {
        const normalized = normalizeRepositoryPath(changedPath);
        return (
            matchesAny(denied, normalized) ||
            !matchesAny(globalAllowed, normalized) ||
            !matchesAny(workerAllowed, normalized)
        );
    });

    if (violations.length > 0) {
        throw new Error(`Worker changed paths outside its authority: ${violations.join(', ')}`);
    }
}

export function parsePorcelainZ(output: string): string[] {
    const entries = output.split('\0').filter(Boolean);
    const changed = new Set<string>();

    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry.length < 4) {
            continue;
        }

        const status = entry.slice(0, 2);
        changed.add(normalizeRepositoryPath(entry.slice(3)));

        if (status.includes('R') || status.includes('C')) {
            const source = entries[index + 1];
            if (source) {
                changed.add(normalizeRepositoryPath(source));
                index += 1;
            }
        }
    }

    return [...changed].sort();
}

export function resolveInside(root: string, repositoryPath: string): string {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(root, repositoryPath);
    const relative = path.relative(resolvedRoot, resolved);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Path escapes repository root: ${repositoryPath}`);
    }

    return resolved;
}

export function mutableScopesOverlap(left: string[], right: string[]): boolean {
    return left.some(leftPattern => right.some(rightPattern => patternsMayOverlap(leftPattern, rightPattern)));
}

function patternsMayOverlap(left: string, right: string): boolean {
    const leftPrefix = staticPrefix(left);
    const rightPrefix = staticPrefix(right);
    return leftPrefix.startsWith(rightPrefix) || rightPrefix.startsWith(leftPrefix);
}

function staticPrefix(pattern: string): string {
    const normalized = normalizeRepositoryPath(pattern);
    const wildcardIndex = normalized.search(/[*?]/);
    return wildcardIndex === -1 ? normalized : normalized.slice(0, wildcardIndex);
}

function globToRegExp(pattern: string): RegExp {
    let source = '^';

    for (let index = 0; index < pattern.length; index += 1) {
        const character = pattern[index];
        const next = pattern[index + 1];

        if (character === '*' && next === '*') {
            const followedBySlash = pattern[index + 2] === '/';
            source += followedBySlash ? '(?:.*/)?' : '.*';
            index += followedBySlash ? 2 : 1;
            continue;
        }

        if (character === '*') {
            source += '[^/]*';
            continue;
        }

        if (character === '?') {
            source += '[^/]';
            continue;
        }

        source += escapeRegExp(character);
    }

    return new RegExp(`${source}$`);
}

function escapeRegExp(value: string): string {
    return /[\\^$.*+?()[\]{}|]/.test(value) ? `\\${value}` : value;
}

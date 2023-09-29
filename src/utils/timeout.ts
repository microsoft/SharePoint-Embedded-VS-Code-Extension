export function timeoutForSeconds(seconds: number) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}
export function rewriteUrl(url: string): string {
  return url
    .replace(/\/\/localhost([:/]|$)/g, '//host.docker.internal$1')
    .replace(/\/\/127\.0\.0\.1([:/]|$)/g, '//host.docker.internal$1');
}

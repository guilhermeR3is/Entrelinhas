export type TabStatus = 'active' | 'inactive';

const SUPPORTED_HOSTS = new Set(['www.youtube.com']);

export function tabStatusFromUrl(url: string | undefined): TabStatus {
  if (url === undefined || !URL.canParse(url)) return 'inactive';
  const { protocol, hostname } = new URL(url);
  return protocol === 'https:' && SUPPORTED_HOSTS.has(hostname) ? 'active' : 'inactive';
}

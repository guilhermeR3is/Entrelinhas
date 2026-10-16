export type TabStatus = { kind: 'active'; site: string } | { kind: 'inactive' };

const SUPPORTED_HOSTS = new Set(['www.youtube.com']);

export function tabStatusFromUrl(url: string | undefined): TabStatus {
  if (url === undefined || !URL.canParse(url)) return { kind: 'inactive' };
  const { protocol, hostname } = new URL(url);
  if (protocol !== 'https:' || !SUPPORTED_HOSTS.has(hostname)) return { kind: 'inactive' };
  return { kind: 'active', site: hostname.replace(/^www\./, '') };
}

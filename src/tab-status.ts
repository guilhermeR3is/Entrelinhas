import { toUnicode } from 'punycode';

export type TabStatus =
  | { kind: 'active'; site: string }
  | { kind: 'available'; site: string; origin: string }
  | { kind: 'enabled'; site: string; origin: string }
  | { kind: 'unsupported' };

const SUPPORTED_HOSTS = new Set(['www.youtube.com']);

export function tabStatusFromUrl(
  url: string | undefined,
  grantedOrigins: readonly string[] = [],
): TabStatus {
  if (url === undefined || !URL.canParse(url)) return { kind: 'unsupported' };
  const { protocol, hostname } = new URL(url);
  if (protocol !== 'https:' || hostname === '') return { kind: 'unsupported' };

  const site = siteName(hostname);
  if (SUPPORTED_HOSTS.has(hostname)) return { kind: 'active', site };
  const origin = `https://${hostname}/*`;
  return grantedOrigins.includes(origin)
    ? { kind: 'enabled', site, origin }
    : { kind: 'available', site, origin };
}

export function siteName(hostname: string): string {
  return toUnicode(hostname).replace(/^www\./, '');
}

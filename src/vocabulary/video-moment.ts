const YOUTUBE_HOSTS = new Set(['www.youtube.com', 'm.youtube.com', 'youtube.com']);

export function formatVideoTime(timeMs: number): string {
  const totalSeconds = Math.floor(timeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${String(minutes)}:${seconds}`;
}

export function videoLinkAt(pageUrl: string, timeMs: number): string {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return pageUrl;
  }
  if (!YOUTUBE_HOSTS.has(url.hostname) || url.pathname !== '/watch') return url.href;
  url.searchParams.set('t', `${String(Math.floor(timeMs / 1000))}s`);
  return url.href;
}

export function isWebLink(link: string): boolean {
  return /^https?:\/\//i.test(link);
}

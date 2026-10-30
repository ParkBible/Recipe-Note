/** youtube.com/watch?v=, youtu.be/, /shorts/, /embed/ 형식에서 11자 videoId 를 꺼낸다 */
export function parseYoutubeVideoId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  let candidate: string | null = null;
  if (host === 'youtu.be') {
    candidate = url.pathname.slice(1).split('/')[0];
  } else if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') candidate = url.searchParams.get('v');
    else {
      const match = url.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/);
      candidate = match?.[2] ?? null;
    }
  }
  return candidate && /^[\w-]{10,12}$/.test(candidate) ? candidate : null;
}

export const youtubeThumbnailUrl = (videoId: string) =>
  `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

export const youtubeEmbedUrl = (videoId: string, startSec?: number) =>
  `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1${startSec ? `&start=${startSec}` : ''}`;

export const youtubeWatchUrl = (videoId: string, startSec?: number) =>
  `https://www.youtube.com/watch?v=${videoId}${startSec ? `&t=${startSec}s` : ''}`;

export function formatTimestamp(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

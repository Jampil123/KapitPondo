// GIPHY stickers are fetched with a public client key (as GIPHY's own SDKs do) and sent as a message's image_url — nothing is stored on our side.
const API_KEY = process.env.EXPO_PUBLIC_GIPHY_API_KEY;
const BASE = 'https://api.giphy.com/v1/stickers';

export const stickersEnabled = !!API_KEY;

export interface Sticker {
  id: string;
  /** Small animated preview for the picker grid. */
  previewUrl: string;
  /** The version that gets sent. */
  url: string;
}

interface GiphyImage { url: string; webp?: string }
interface GiphyItem { id: string; images: { fixed_width_small: GiphyImage; fixed_width: GiphyImage } }

export async function fetchStickers(query: string): Promise<Sticker[]> {
  if (!API_KEY) return [];
  const q = query.trim();
  const params = new URLSearchParams({ api_key: API_KEY, limit: '30', rating: 'g' });
  if (q) params.set('q', q);
  const res = await fetch(`${BASE}/${q ? 'search' : 'trending'}?${params}`);
  if (!res.ok) throw new Error(`Couldn't load stickers (${res.status})`);
  const json = (await res.json()) as { data: GiphyItem[] };
  return json.data.map((g) => ({
    id: g.id,
    previewUrl: g.images.fixed_width_small.webp ?? g.images.fixed_width_small.url,
    url: g.images.fixed_width.url,
  }));
}

/** A message image that came from the sticker picker (rendered without a bubble). */
export function isStickerUrl(url: string | null | undefined): boolean {
  return !!url && /^https:\/\/media\d*\.giphy\.com\//.test(url);
}

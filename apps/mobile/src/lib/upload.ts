/**
 * lib/upload.ts
 * ----------------------------------------------------------------------------
 * Upload a local image (from expo-image-picker) to Supabase Storage.
 * Returns the storage PATH (not a public URL) — ID documents belong in a
 * PRIVATE bucket, so the backend issues signed URLs when an admin views them.
 *
 * Deps: expo-file-system, base64-arraybuffer.
 *   npx expo install expo-file-system
 *   npm i base64-arraybuffer
 *
 * Buckets to create in Supabase Storage:
 *   - id-documents   (KYC IDs, private)
 *   - proofs         (payment / expense proof images, private)
 *   - avatars        (profile pictures, PUBLIC — see migration 0019)
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { decode, encode } from 'base64-arraybuffer';
import { supabase } from './supabase';

const EXT_BY_TYPE: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/jpg': 'jpg' };
const TYPE_BY_EXT: Record<string, string> = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

/**
 * A picked image's bytes, base64 and type — on the phone read from the local
 * file, on the web from the blob:/data: URL the picker hands back (expo-file-system
 * has no web implementation, and those URLs carry no file extension).
 */
async function readLocalImage(localUri: string): Promise<{ bytes: ArrayBuffer; base64: string; mediaType: string; ext: string }> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(localUri)).blob();
    const bytes = await blob.arrayBuffer();
    const ext = EXT_BY_TYPE[blob.type] ?? 'jpg';
    return { bytes, base64: encode(bytes), mediaType: TYPE_BY_EXT[ext], ext };
  }
  const guessed = (localUri.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
  const ext = TYPE_BY_EXT[guessed] ? (guessed === 'jpeg' ? 'jpg' : guessed) : 'jpg';
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
  return { bytes: decode(base64), base64, mediaType: TYPE_BY_EXT[ext], ext };
}

/** Reads a local image file as base64 + its media type, for sending to an API (e.g. OCR/AI) rather than to storage. */
export async function readImageBase64(localUri: string): Promise<{ base64: string; mediaType: string }> {
  const { base64, mediaType } = await readLocalImage(localUri);
  return { base64, mediaType };
}

export async function uploadImage(
  bucket: 'id-documents' | 'proofs',
  localUri: string,
  prefix = 'upload',
): Promise<string> {
  const { bytes, mediaType, ext } = await readLocalImage(localUri);
  const path = `${prefix}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, { contentType: mediaType, upsert: false });

  if (error) throw error;
  return path;
}

/**
 * Upload a profile picture to the public `avatars` bucket and return its
 * public URL (not a path — unlike uploadImage's private buckets, avatars
 * are rendered directly by the app, so the caller needs the real URL).
 */
export async function uploadAvatar(memberId: string, localUri: string): Promise<string> {
  const { bytes, mediaType, ext } = await readLocalImage(localUri);
  const path = `${memberId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, bytes, { contentType: mediaType, upsert: true });

  if (error) throw error;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

/**
 * Upload a photo shared in group chat to the public `chat-media` bucket
 * (see 0049_chat_media.sql) and return its public URL — same "no signed-URL
 * exchange" tradeoff as avatars, since a chat image isn't sensitive the way
 * an ID document or payment proof is.
 */
export async function uploadChatImage(groupId: string, localUri: string): Promise<string> {
  const { bytes, mediaType, ext } = await readLocalImage(localUri);
  const path = `${groupId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('chat-media')
    .upload(path, bytes, { contentType: mediaType, upsert: false });

  if (error) throw error;
  return supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl;
}
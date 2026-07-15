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
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

export async function uploadImage(
  bucket: 'id-documents' | 'proofs',
  localUri: string,
  prefix = 'upload',
): Promise<string> {
  const ext = (localUri.split('.').pop() || 'jpg').toLowerCase();
  const path = `${prefix}/${Date.now()}.${ext}`;

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, decode(base64), {
      contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
      upsert: false,
    });

  if (error) throw error;
  return path;
}

/**
 * Upload a profile picture to the public `avatars` bucket and return its
 * public URL (not a path — unlike uploadImage's private buckets, avatars
 * are rendered directly by the app, so the caller needs the real URL).
 */
export async function uploadAvatar(memberId: string, localUri: string): Promise<string> {
  const ext = (localUri.split('.').pop() || 'jpg').toLowerCase();
  const path = `${memberId}/${Date.now()}.${ext}`;

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, decode(base64), {
      contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
      upsert: true,
    });

  if (error) throw error;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
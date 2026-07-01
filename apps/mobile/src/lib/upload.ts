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
 * Buckets to create in Supabase Storage (private):
 *   - id-documents   (KYC IDs)
 *   - proofs         (payment / expense proof images)
 */
import * as FileSystem from 'expo-file-system';
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
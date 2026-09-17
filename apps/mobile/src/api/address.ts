/**
 * api/address.ts
 * ----------------------------------------------------------------------------
 * Client for the backend's /api/address/* endpoints — a live PSGC (Philippine
 * Standard Geographic Code) proxy plus best-effort zip-code validation, used
 * by the identity wizard's residential-address step (identity.tsx) via
 * AddressPickerSheet. Replaces the old bundled-npm-dataset lookup in
 * constants/phAddress.ts as the primary source; that file is kept only as an
 * offline fallback if these calls fail (see identity.tsx).
 */
import { api } from './client';

export type AddressOption = { label: string; value: string };

export async function fetchProvinces(): Promise<AddressOption[]> {
  const res = await api.get<{ provinces: AddressOption[] }>('/api/address/provinces');
  return res.provinces;
}

export async function fetchCities(province: string): Promise<AddressOption[]> {
  const res = await api.get<{ cities: AddressOption[] }>(
    `/api/address/provinces/${encodeURIComponent(province)}/cities`,
  );
  return res.cities;
}

export async function fetchBarangays(province: string, city: string): Promise<AddressOption[]> {
  const res = await api.get<{ barangays: AddressOption[] }>(
    `/api/address/cities/${encodeURIComponent(city)}/barangays`,
    { province },
  );
  return res.barangays;
}

export type ZipCheckResult = { valid: boolean; knownZips: string[]; reason?: string };

export async function checkZip(province: string, city: string, zip: string): Promise<ZipCheckResult> {
  return api.get<ZipCheckResult>('/api/address/zip-check', { province, city, zip });
}

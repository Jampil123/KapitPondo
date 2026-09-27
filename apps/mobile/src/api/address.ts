/**
 * api/address.ts
 * ----------------------------------------------------------------------------
 * Client for the backend's /api/address/* endpoints — a live PSGC (Philippine
 * Standard Geographic Code) proxy plus best-effort zip-code validation, used
 * by the address pickers (identity wizard, edit profile) via AddressPickerSheet.
 * The load* helpers fall back to the bundled dataset in constants/phAddress.ts
 * when a call fails.
 */
import { api } from './client';
import { searchProvinces, searchCities, searchBarangays, regionCodeOfProvince } from '../constants/phAddress';

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

/** Provinces, optionally only those in `regionCode` (e.g. "Region IV-A"). */
export async function loadProvinces(regionCode?: string): Promise<AddressOption[]> {
  let options: AddressOption[];
  try {
    options = await fetchProvinces();
  } catch {
    options = searchProvinces('');
  }
  if (!regionCode) return options;
  const inRegion = options.filter((o) => regionCodeOfProvince(o.value) === regionCode);
  // The live PSGC list has no province for NCR; its cities sit under "Metro Manila" in the bundled data.
  if (regionCode === 'NCR' && !inRegion.length) return searchProvinces('Metro Manila');
  return inRegion;
}

export async function loadCities(province: string): Promise<AddressOption[]> {
  try {
    return await fetchCities(province);
  } catch {
    return searchCities(province, '');
  }
}

export async function loadBarangays(province: string, city: string): Promise<AddressOption[]> {
  try {
    return await fetchBarangays(province, city);
  } catch {
    return searchBarangays(city, '');
  }
}

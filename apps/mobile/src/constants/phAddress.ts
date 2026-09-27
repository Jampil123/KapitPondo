/**
 * constants/phAddress.ts
 * ----------------------------------------------------------------------------
 * Real PH province/city/barangay data (PSGC, via the `psgc` npm package) for
 * the address pickers (identity wizard, edit profile), plus the fixed list of
 * 17 regions and which region each province belongs to.
 *
 * KNOWN LIMITATION: municipalities.json only names each city/municipality's
 * PROVINCE, and barangays.json only names each barangay's CITY/MUNICIPALITY —
 * a barangay record carries no province of its own. 122 of the ~1,634
 * municipality names are reused across different provinces (e.g. 9 different
 * towns named "San Isidro"), so the barangay list for one of those towns is
 * matched by name only and can include barangays belonging to a same-named
 * town in another province. There's no stronger key to disambiguate with in
 * this dataset. Zip code isn't PSGC data at all (that's a separate PHLPost
 * dataset, and no verified source was available to bundle here) — it's kept
 * as a manual field in the form, deliberately not driven by this file.
 */
import provincesData from 'psgc/dist/data/provinces.json';
import municipalitiesData from 'psgc/dist/data/municipalities.json';
import barangaysData from 'psgc/dist/data/barangays.json';
import regionsData from 'psgc/dist/data/regions.json';

type ProvinceRow = { name: string; region: string };
type MunicipalityRow = { name: string; province: string; city?: boolean };
// `code` is typed loosely on purpose — the upstream dataset stores it as a
// string when it has a leading zero and as a bare number otherwise, and this
// file never reads it anyway (only name/province/citymun).
type BarangayRow = { code: string | number; name: string; citymun: string };

const provinces = provincesData as ProvinceRow[];
const municipalities = municipalitiesData as MunicipalityRow[];
const barangays = barangaysData as BarangayRow[];

export type AddressOption = { label: string; value: string };

function matches(name: string, query: string) {
  return name.toLowerCase().includes(query.trim().toLowerCase());
}

function toOptions(names: string[]): AddressOption[] {
  return names.sort((a, b) => a.localeCompare(b)).map((name) => ({ label: name, value: name }));
}

export function searchProvinces(query: string): AddressOption[] {
  return toOptions(provinces.filter((p) => matches(p.name, query)).map((p) => p.name));
}

export function searchCities(provinceName: string, query: string): AddressOption[] {
  return toOptions(
    municipalities.filter((m) => m.province === provinceName && matches(m.name, query)).map((m) => m.name),
  );
}

export function searchBarangays(cityName: string, query: string): AddressOption[] {
  return toOptions(
    barangays.filter((b) => b.citymun === cityName && matches(b.name, query)).map((b) => b.name),
  );
}

type RegionRow = { name: string; designation: string };

/** Stored value is e.g. "Region IV-A (CALABARZON)"; `code` matches provinces.json's `region`. */
export const REGIONS: (AddressOption & { code: string })[] = (regionsData as RegionRow[]).map((r) => {
  const value = `${r.designation} (${r.name})`;
  return { label: value, value, code: r.designation };
});

// Live PSGC province names that the bundled dataset spells differently.
const PROVINCE_REGION_ALIASES: Record<string, string> = {
  samar: 'Region VIII',
  'davao de oro': 'Region XI',
  maguindanao: 'BARMM',
};
const regionByProvince = new Map(provinces.map((p) => [p.name.toLowerCase(), p.region]));

export function regionCodeOfProvince(provinceName: string): string | undefined {
  const key = provinceName.trim().toLowerCase();
  return regionByProvince.get(key) ?? PROVINCE_REGION_ALIASES[key];
}

/** The region code for a stored region value, or undefined for free text that isn't in REGIONS. */
export function regionCode(regionValue: string | null | undefined): string | undefined {
  return REGIONS.find((r) => r.value === regionValue)?.code;
}

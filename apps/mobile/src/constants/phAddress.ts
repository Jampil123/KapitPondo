/**
 * constants/phAddress.ts
 * ----------------------------------------------------------------------------
 * Real PH province/city/barangay data (PSGC, via the `psgc` npm package) for
 * the identity wizard's address pickers (step 3). Region stays a free-text
 * field elsewhere in the form — only province/city/barangay are constrained
 * to this dataset, since province -> city -> barangay is the part of the
 * hierarchy this data actually supports reliably.
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

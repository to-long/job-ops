import type { ResumeProfile } from "@shared/types";

/**
 * A flat bag of values we know how to fill into an application form, keyed by
 * stable profile attribute names. The field mapper picks the best key for each
 * detected form control; anything not present here is left blank for the user.
 */
export interface ProfileFillData {
  values: Record<string, string>;
  /** Keys in a stable order, used when describing the profile to the LLM. */
  keys: string[];
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return {
    first: parts[0],
    last: parts.slice(1).join(" "),
  };
}

/**
 * Flattens a resume profile into the set of values we can auto-fill. Pure and
 * side-effect free so it can be unit tested without a browser or network.
 */
export function buildProfileFillData(profile: ResumeProfile): ProfileFillData {
  const basics = profile.basics ?? {};
  const location = basics.location ?? {};
  const values: Record<string, string> = {};

  const set = (key: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed) values[key] = trimmed;
  };

  const fullName = clean(basics.name);
  set("fullName", fullName);
  const { first, last } = splitName(fullName);
  set("firstName", first);
  set("lastName", last);

  set("email", clean(basics.email));
  set("phone", clean(basics.phone));
  set("headline", clean(basics.headline));
  set("summary", clean(basics.summary));
  set("website", clean(basics.url));

  set("addressLine", clean(location.address));
  set("city", clean(location.city));
  set("region", clean(location.region));
  set("postalCode", clean(location.postalCode));
  set("countryCode", clean(location.countryCode));

  // A single human-readable location string, useful for combined fields.
  const locationParts = [
    clean(location.address),
    clean(location.city),
    clean(location.region),
    clean(location.postalCode),
    clean(location.countryCode),
  ].filter(Boolean);
  set("location", locationParts.join(", "));

  for (const entry of basics.profiles ?? []) {
    const network = clean(entry?.network).toLowerCase();
    const url = clean(entry?.url);
    const username = clean(entry?.username);
    if (!network) continue;
    if (url) set(`${network}Url`, url);
    if (username) set(`${network}Username`, username);
  }

  return {
    values,
    keys: Object.keys(values),
  };
}

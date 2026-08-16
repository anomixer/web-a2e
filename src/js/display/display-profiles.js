/*
 * display-profiles.js - User-created display profiles
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/**
 * Storage and validation for display profiles the user saves themselves.
 *
 * Deliberately free of DOM and of the settings window, so the rules about what
 * a profile is can be tested on their own. The window handles presentation;
 * everything about identity, validation and persistence lives here.
 *
 * Profiles live under their own storage key rather than inside the settings
 * blob. Reset to Defaults throws away the current picture, and someone's saved
 * monitors are not part of the current picture — losing them to a reset would
 * be an unpleasant surprise.
 */

export const PROFILE_STORAGE_KEY = "a2e-display-profiles";

/** Marks an id as a user profile, so it can never collide with a built-in. */
export const PROFILE_ID_PREFIX = "user:";

export const MAX_PROFILE_NAME_LENGTH = 40;

/** A profile is identified by its name: saving over a name replaces it. */
export function profileId(name) {
  return PROFILE_ID_PREFIX + name.trim().toLowerCase();
}

export function isProfileId(id) {
  return typeof id === "string" && id.startsWith(PROFILE_ID_PREFIX);
}

/**
 * Validate a name typed by the user.
 *
 * @returns {{ok: true, name: string} | {ok: false, error: string}}
 */
export function validateProfileName(rawName) {
  const name = typeof rawName === "string" ? rawName.trim() : "";

  if (!name) {
    return { ok: false, error: "Give the profile a name." };
  }
  if (name.length > MAX_PROFILE_NAME_LENGTH) {
    return {
      ok: false,
      error: `Keep the name under ${MAX_PROFILE_NAME_LENGTH} characters.`,
    };
  }
  // "Custom" is the label for settings that match no profile at all, so a
  // profile by that name could never be selected — the window would show the
  // same word for two different states.
  if (name.toLowerCase() === "custom") {
    return { ok: false, error: '"Custom" is reserved — pick another name.' };
  }

  return { ok: true, name };
}

/**
 * Read the saved profiles.
 *
 * Anything malformed is dropped rather than thrown: a corrupted entry should
 * cost the user that one profile, not the whole window.
 */
export function loadProfiles(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (p) =>
          p &&
          typeof p.name === "string" &&
          p.name.trim() !== "" &&
          p.values &&
          typeof p.values === "object",
      )
      .map((p) => ({
        id: profileId(p.name),
        name: p.name.trim(),
        values: { ...p.values },
      }));
  } catch (e) {
    console.warn("Could not load display profiles:", e);
    return [];
  }
}

export function saveProfiles(profiles, storage = globalThis.localStorage) {
  try {
    storage?.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify(
        profiles.map((p) => ({ name: p.name, values: p.values })),
      ),
    );
    return true;
  } catch (e) {
    console.warn("Could not save display profiles:", e);
    return false;
  }
}

/**
 * Add a profile, or replace one of the same name.
 *
 * Returns a new array; the caller decides whether to persist it. `replaced`
 * tells the caller whether this overwrote something, so it can confirm first.
 *
 * @returns {{profiles: Array, profile: Object, replaced: boolean}}
 */
export function upsertProfile(profiles, name, values) {
  const id = profileId(name);
  const profile = { id, name: name.trim(), values: { ...values } };
  const index = profiles.findIndex((p) => p.id === id);

  if (index === -1) {
    return { profiles: [...profiles, profile], profile, replaced: false };
  }

  const next = [...profiles];
  next[index] = profile;
  return { profiles: next, profile, replaced: true };
}

export function deleteProfile(profiles, id) {
  return profiles.filter((p) => p.id !== id);
}

export function findProfile(profiles, id) {
  return profiles.find((p) => p.id === id) || null;
}

/**
 * Capture the settings a profile should remember.
 *
 * A profile keeps *everything*, including brightness, contrast, saturation and
 * the bezel — which is exactly where it differs from a built-in preset. The
 * built-ins leave those alone on purpose, because they imitate a monitor and
 * have no business resetting someone's calibration. A profile is not imitating
 * anything: it is a snapshot of a picture the user liked, so restoring it has
 * to give back that picture and not a partly-reverted version of it.
 *
 * `preset` is excluded because it names the selection rather than describing
 * the picture, and storing it would make a profile point at itself.
 */
export function captureProfileValues(settings) {
  const values = { ...settings };
  delete values.preset;
  return values;
}

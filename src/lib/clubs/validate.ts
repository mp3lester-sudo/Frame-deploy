export const CLUB_NAME_MAX = 100;
export const CLUB_DESCRIPTION_MAX = 500;
export const CLUB_POST_MAX = 2000;

type Validation = { ok: true; value: string } | { ok: false; error: string };

export function validateClubName(raw: string): Validation {
  const value = raw.trim();
  if (!value) return { ok: false, error: "Give your club a name" };
  if (value.length > CLUB_NAME_MAX) return { ok: false, error: `Club names are limited to ${CLUB_NAME_MAX} characters` };
  return { ok: true, value };
}

export function validateClubDescription(raw: string): Validation {
  const value = raw.trim();
  if (value.length > CLUB_DESCRIPTION_MAX) {
    return { ok: false, error: `Descriptions are limited to ${CLUB_DESCRIPTION_MAX} characters` };
  }
  return { ok: true, value };
}

export function validateClubPostBody(raw: string): Validation {
  const value = raw.trim();
  if (!value) return { ok: false, error: "Post can't be empty" };
  if (value.length > CLUB_POST_MAX) return { ok: false, error: `Posts are limited to ${CLUB_POST_MAX} characters` };
  return { ok: true, value };
}

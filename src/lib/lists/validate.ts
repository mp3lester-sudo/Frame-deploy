export const LIST_TITLE_MAX = 100;
export const LIST_DESCRIPTION_MAX = 500;
export const LIST_ITEM_NOTE_MAX = 280;

type Validation = { ok: true; value: string } | { ok: false; error: string };

export function validateListTitle(raw: string): Validation {
  const value = raw.trim();
  if (!value) return { ok: false, error: "Give your list a name" };
  if (value.length > LIST_TITLE_MAX) return { ok: false, error: `List names are limited to ${LIST_TITLE_MAX} characters` };
  return { ok: true, value };
}

export function validateListDescription(raw: string): Validation {
  const value = raw.trim();
  if (value.length > LIST_DESCRIPTION_MAX) {
    return { ok: false, error: `Descriptions are limited to ${LIST_DESCRIPTION_MAX} characters` };
  }
  return { ok: true, value };
}

export function validateListItemNote(raw: string): Validation {
  const value = raw.trim();
  if (value.length > LIST_ITEM_NOTE_MAX) {
    return { ok: false, error: `Notes are limited to ${LIST_ITEM_NOTE_MAX} characters` };
  }
  return { ok: true, value };
}

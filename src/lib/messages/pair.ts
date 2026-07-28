/**
 * A 1:1 conversation is stored once per pair, with the two participant
 * columns canonically ordered (user_a < user_b) so a unique constraint on
 * (user_a, user_b) prevents ever creating two conversation rows for the same
 * pair of people regardless of who starts it. Postgres compares uuid columns
 * byte-wise, which matches a plain string comparison on their canonical
 * lowercase-hyphenated text form (what gen_random_uuid() and every uuid
 * column in this schema uses) — so ordering in JS here has to agree with
 * ordering in the database's own `user_a < user_b` check constraint.
 */
export function orderPair(idA: string, idB: string): [string, string] {
  if (idA === idB) throw new Error("Cannot create a conversation with yourself");
  return idA < idB ? [idA, idB] : [idB, idA];
}

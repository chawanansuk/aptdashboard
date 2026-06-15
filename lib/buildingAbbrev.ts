/**
 * Building → short label for the RoomCard sub-label (Problem #3).
 * Room numbers repeat across buildings (102 exists in three of them),
 * so each card needs a quick visual marker for which building it
 * belongs to without spelling out the full name.
 *
 * Explicit map for the known 5 — picked so every entry is unique
 * (the obvious 2-char prefixes "มี" and "มา" both collide). Falls
 * back to the first two characters for anything we haven't mapped
 * (a new building added in the sheet won't crash; it just gets a
 * less-curated abbrev until someone updates this map).
 */
const BUILDING_ABBREV: Record<string, string> = {
  "Kl": "KL",
  "KL": "KL",
  "มั่งมี": "มม",
  "มายทรี48": "มย",
  "มายทรี": "มย",
  "มีทรัพย์": "มร",
  "มีทอง": "มท",
};

export function abbreviateBuilding(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "";
  const mapped = BUILDING_ABBREV[trimmed];
  if (mapped) return mapped;
  return trimmed.slice(0, 2);
}

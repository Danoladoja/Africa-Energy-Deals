/**
 * Name Normalizer — shared utility for consistent project name normalization.
 *
 * Used in:
 *  - writeCandidate() before fuzzy dedup
 *  - Admin Duplicate Scanner (normalized_name column comparison)
 *  - /api/projects/similar query normalization
 *  - /api/projects/similar contribution check
 */

const STRIP_WORDS = [
  // Phase markers
  "phase 1", "phase 2", "phase 3", "phase 4", "phase 5",
  "phase i", "phase ii", "phase iii", "phase iv", "phase v",
  // Filler project words
  "project", "development", "initiative", "programme", "program",
  "scheme", "facility",
  // Legal suffixes
  "limited", "ltd", "pty", "inc", "plc", "sarl", "sa", "bv",
  "gmbh", "llc", "llp", "corp", "corporation",
];

// Build a single regex that matches any of the strip words as whole words (word boundary)
// Sorted longest-first so multi-word tokens (e.g. "phase iii") match before single-word tokens
const STRIP_PATTERN = new RegExp(
  "\\b(" +
    STRIP_WORDS
      .slice()
      .sort((a, b) => b.length - a.length)
      .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|") +
    ")\\b",
  "gi",
);

/**
 * Normalize a project name for robust deduplication comparisons.
 *
 * Rules (applied in order):
 *  1. Lowercase
 *  2. Strip filler words & legal suffixes (whole-word match)
 *  3. Remove all characters except letters, digits, hyphens, spaces
 *  4. Collapse multiple spaces into one
 *  5. Trim
 */
export function normalizeProjectName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(STRIP_PATTERN, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

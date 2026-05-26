/**
 * Derive a URL-friendly slug from an event name.
 *
 * - Lowercases the input.
 * - Replaces any run of non-alphanumeric characters with a single "-".
 * - Collapses repeated separators.
 * - Trims leading/trailing "-".
 * - Empty or punctuation-only input yields "".
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

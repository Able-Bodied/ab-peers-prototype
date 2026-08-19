/**
 * Fuzzy title matching for grouping recurring event occurrences into an
 * `event_series` row (see supabase/migrations/20260819150000_event_series_by_title.sql).
 *
 * NorCal SCI's URLs don't repeat across occurrences of a recurring event the
 * way some other feeds' do, so the only reliable signal left is the title —
 * and even that varies slightly between occurrences sometimes ("NorCal SCI's
 * Friday Happy Hour" vs "NorCal SCI Friday Happy Hour"). Exact match after
 * normalizing case/whitespace/punctuation covers the common case; Levenshtein
 * similarity covers near-duplicates without an external dependency.
 */

export function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prevRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row.push(Math.min(row[j - 1] + 1, prevRow[j] + 1, prevRow[j - 1] + cost));
    }
    prevRow = row;
  }
  return prevRow[b.length];
}

/**
 * 1 for identical (post-normalization) titles, trending toward 0 as they
 * diverge — edit distance normalized to the longer normalized string's
 * length, so the score is comparable across different title lengths.
 */
export function titleSimilarity(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

/**
 * Judgment call, not a measured constant: 0.82 groups things like the
 * apostrophe-s variant above (similarity ~0.95) and short typos, without
 * conflating genuinely different titles ("Wheelchair Rugby Practice" vs
 * "Wheelchair Rugby Tournament" scores well under this). Tune here if a real
 * scrape shows it too loose or too strict.
 */
export const SERIES_MATCH_THRESHOLD = 0.82;

/**
 * The best candidate for `title` among `candidates` (each `{ id, title }`),
 * or null if nothing clears the threshold. Exact matches always win: an exact
 * match scores 1, so it beats any fuzzy-only candidate without special-casing.
 */
export function findSeriesMatch(title, candidates, threshold = SERIES_MATCH_THRESHOLD) {
  let best = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = titleSimilarity(title, candidate.title);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return bestScore >= threshold ? best : null;
}

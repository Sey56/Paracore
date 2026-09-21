/**
 * Simple fuzzy match — checks if all characters in `query` appear in order
 * in `target` (with gaps allowed). Case-insensitive.
 * Returns a score: higher = better match. Returns 0 if no match.
 */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return 1;

  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let firstMatch = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (firstMatch === -1) firstMatch = ti;
      consecutive++;
      // Bonus for consecutive matches and early starts
      score += consecutive * 2 + (ti === firstMatch ? 5 : 0);
      qi++;
    } else {
      consecutive = 0;
    }
  }

  // All query chars must match
  if (qi < q.length) return 0;

  // Penalty for match length ratio (shorter target = better)
  const lengthRatio = q.length / t.length;
  return score * (1 + lengthRatio);
}

/**
 * Fuzzy match against multiple fields. Returns true if any field matches.
 */
export function fuzzyMatch(query: string, fields: string[]): boolean {
  if (!query) return true;
  const q = query.trim();
  if (!q) return true;

  // Try exact substring first (fast path)
  const qLower = q.toLowerCase();
  for (const field of fields) {
    if (field.toLowerCase().includes(qLower)) return true;
  }

  // Then try fuzzy matching individual words in the query
  const words = q.split(/\s+/).filter(w => w.length > 0);

  for (const word of words) {
    let wordMatched = false;
    for (const field of fields) {
      if (fuzzyScore(word, field) > 2) {
        wordMatched = true;
        break;
      }
    }
    if (!wordMatched) return false;
  }

  return true;
}

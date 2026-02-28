export const DEFAULT_ERROR_PATTERNS = [
  "\\bError\\b",
  "\\bTypeError\\b",
  "\\bFATAL\\b",
  "\\bException\\b",
  "\\bTraceback\\b"
];

export const DEFAULT_IGNORE_EXIT_CODES = [130];
export const DEFAULT_DEBOUNCE_MS = 1200;

export interface PatternParseResult {
  compiled: RegExp[];
  invalid: string[];
}

export function parseErrorPatterns(raw: unknown): PatternParseResult {
  const candidates = normalizeStringArray(raw, DEFAULT_ERROR_PATTERNS);
  const compiled: RegExp[] = [];
  const invalid: string[] = [];

  for (const candidate of candidates) {
    const pattern = candidate.trim();
    if (pattern.length === 0) {
      continue;
    }

    try {
      compiled.push(new RegExp(pattern, "i"));
    } catch {
      invalid.push(pattern);
    }
  }

  return { compiled, invalid };
}

export function normalizeIgnoreExitCodes(raw: unknown): number[] {
  const values = normalizeUnknownArray(raw, DEFAULT_IGNORE_EXIT_CODES);
  const unique = new Set<number>();

  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }

    const normalized = Math.trunc(value);
    if (normalized === 0) {
      continue;
    }

    unique.add(normalized);
  }

  return [...unique];
}

export function normalizeDebounceMs(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_DEBOUNCE_MS;
  }

  const clamped = Math.max(0, Math.min(60000, raw));
  return Math.trunc(clamped);
}

export function normalizeStringArray(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) {
    return [...fallback];
  }

  return raw.filter((value): value is string => typeof value === "string");
}

function normalizeUnknownArray(raw: unknown, fallback: unknown[]): unknown[] {
  if (!Array.isArray(raw)) {
    return [...fallback];
  }

  return raw;
}

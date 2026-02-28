import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_ERROR_PATTERNS,
  normalizeDebounceMs,
  normalizeIgnoreExitCodes,
  parseErrorPatterns
} from "../core/configParser";

test("parseErrorPatterns compiles valid regex entries and reports invalid entries", () => {
  const result = parseErrorPatterns(["Error", "[invalid", "TypeError"]);
  assert.equal(result.compiled.length, 2);
  assert.deepEqual(result.invalid, ["[invalid"]);
});

test("parseErrorPatterns falls back to default patterns for invalid config shape", () => {
  const result = parseErrorPatterns("not-an-array");
  assert.equal(result.compiled.length, DEFAULT_ERROR_PATTERNS.length);
});

test("normalizeIgnoreExitCodes removes non-numeric and zero values", () => {
  const normalized = normalizeIgnoreExitCodes([130, 2.8, 130, 0, "9"]);
  assert.deepEqual(normalized.sort((a, b) => a - b), [2, 130]);
});

test("normalizeDebounceMs clamps invalid values to defaults and bounds", () => {
  assert.equal(normalizeDebounceMs("abc"), DEFAULT_DEBOUNCE_MS);
  assert.equal(normalizeDebounceMs(-5), 0);
  assert.equal(normalizeDebounceMs(80000), 60000);
});

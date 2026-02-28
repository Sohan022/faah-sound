import assert from "node:assert/strict";
import test from "node:test";
import { RollingPatternMatcher, stripAnsiSequences } from "../core/patternMatcher";

test("stripAnsiSequences removes ANSI color codes", () => {
  const red = "\u001b[31mError:\u001b[0m command failed";
  assert.equal(stripAnsiSequences(red), "Error: command failed");
});

test("RollingPatternMatcher detects patterns across chunk boundaries", () => {
  const key = {};
  const matcher = new RollingPatternMatcher();
  const patterns = [/TypeError/i];

  assert.equal(matcher.matches(key, "Type", patterns), false);
  assert.equal(matcher.matches(key, "Error: x is not a function", patterns), true);
});

test("RollingPatternMatcher keeps terminal buffers isolated", () => {
  const matcher = new RollingPatternMatcher();
  const patterns = [/fatal/i];
  const terminalOne = {};
  const terminalTwo = {};

  assert.equal(matcher.matches(terminalOne, "fa", patterns), false);
  assert.equal(matcher.matches(terminalTwo, "all good", patterns), false);
  assert.equal(matcher.matches(terminalOne, "tal", patterns), true);
  assert.equal(matcher.matches(terminalTwo, "still good", patterns), false);
});

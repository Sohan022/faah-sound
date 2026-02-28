import assert from "node:assert/strict";
import test from "node:test";
import { DebounceGate } from "../core/debounce";

test("DebounceGate allows first trigger and blocks within the debounce window", () => {
  const gate = new DebounceGate(500);
  assert.equal(gate.canTrigger(1000), true);
  assert.equal(gate.canTrigger(1200), false);
  assert.equal(gate.canTrigger(1601), true);
});

test("DebounceGate with zero debounce always allows triggers", () => {
  const gate = new DebounceGate(0);
  assert.equal(gate.canTrigger(1), true);
  assert.equal(gate.canTrigger(1), true);
  assert.equal(gate.canTrigger(2), true);
});

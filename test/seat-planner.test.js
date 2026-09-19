import assert from "node:assert/strict";
import test from "node:test";
import { planSeats } from "../src/seat-planner.js";

const available = (labels) => labels.map((label) => ({ label, available: true, coach: "A" }));

test("prefers a configured table group", () => {
  const seats = available(["A1", "A2", "A3", "A4", "A5", "A6"]);
  const result = planSeats(seats, {
    passengerCount: 4,
    tableSeatGroups: [["A1", "A2", "A3", "A4"]],
    preferredSeatNumbers: [],
  });
  assert.equal(result.strategy, "table");
  assert.deepEqual(result.selected.map((seat) => seat.label), ["A1", "A2", "A3", "A4"]);
});

test("uses preferred seat numbers when no table group is available", () => {
  const seats = available(["A1", "A2", "A5", "A6"]);
  const result = planSeats(seats, {
    passengerCount: 2,
    tableSeatGroups: [],
    preferredSeatNumbers: ["A5", "A6"],
  });
  assert.equal(result.strategy, "preferred");
  assert.deepEqual(result.selected.map((seat) => seat.label), ["A5", "A6"]);
});

test("chooses an exact adjacent run", () => {
  const seats = available(["B1", "B2", "B3", "B7"]);
  const result = planSeats(seats, {
    passengerCount: 3,
    tableSeatGroups: [],
    preferredSeatNumbers: [],
  });
  assert.equal(result.strategy, "adjacent");
  assert.deepEqual(result.selected.map((seat) => seat.label), ["B1", "B2", "B3"]);
});

test("takes the longest run and fills the remainder", () => {
  const seats = available(["C1", "C2", "C5", "D1"]);
  const result = planSeats(seats, {
    passengerCount: 3,
    tableSeatGroups: [],
    preferredSeatNumbers: [],
  });
  assert.equal(result.strategy, "max-adjacent-plus-any");
  assert.deepEqual(result.selected.map((seat) => seat.label), ["C1", "C2", "C5"]);
});

test("does not silently book fewer seats unless partial booking is enabled", () => {
  const seats = available(["D1", "D2"]);
  const result = planSeats(seats, {
    passengerCount: 4,
    tableSeatGroups: [],
    preferredSeatNumbers: [],
    allowPartial: false,
  });
  assert.equal(result.strategy, "insufficient");
  assert.equal(result.selected.length, 0);
});

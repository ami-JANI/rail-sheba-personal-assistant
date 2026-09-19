const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function normalizeLabel(value) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function normalizedSeat(raw, index) {
  const label = String(raw.label ?? raw.seatNo ?? raw.number ?? "").trim();
  const normalized = normalizeLabel(label);
  const numericMatch = normalized.match(/(\d+)(?!.*\d)/);
  const inferredRow = numericMatch
    ? normalized.slice(0, numericMatch.index).replace(/[-_/]+$/g, "")
    : normalized;

  return {
    ...raw,
    _index: raw._index ?? index,
    label,
    normalized,
    row: normalizeLabel(raw.row ?? inferredRow),
    number: Number(raw.number ?? numericMatch?.[1] ?? Number.NaN),
    coach: normalizeLabel(raw.coach ?? "ACTIVE"),
    available: raw.available !== false,
  };
}

function seatSort(a, b) {
  const coach = collator.compare(a.coach, b.coach);
  if (coach) return coach;
  const row = collator.compare(a.row, b.row);
  if (row) return row;
  if (Number.isFinite(a.number) && Number.isFinite(b.number)) return a.number - b.number;
  return collator.compare(a.label, b.label);
}

function consecutiveRuns(seats) {
  const groups = new Map();
  for (const seat of seats) {
    const key = `${seat.coach}|${seat.row}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(seat);
  }

  const runs = [];
  for (const group of groups.values()) {
    group.sort(seatSort);
    let run = [];
    for (const seat of group) {
      const previous = run.at(-1);
      if (
        previous &&
        Number.isFinite(previous.number) &&
        Number.isFinite(seat.number) &&
        seat.number === previous.number + 1
      ) {
        run.push(seat);
      } else {
        if (run.length) runs.push(run);
        run = [seat];
      }
    }
    if (run.length) runs.push(run);
  }
  return runs.sort((a, b) => b.length - a.length || seatSort(a[0], b[0]));
}

function exactLabels(seats, labels) {
  const wanted = labels.map(normalizeLabel);
  const byLabel = new Map(seats.map((seat) => [seat.normalized, seat]));
  const matches = wanted.map((label) => byLabel.get(label)).filter(Boolean);
  return matches.length === wanted.length ? matches : [];
}

export function planSeats(rawSeats, options) {
  const requested = Number(options.passengerCount);
  const available = rawSeats
    .map(normalizedSeat)
    .filter((seat) => seat.available && seat.label)
    .sort(seatSort);

  if (!available.length) {
    return { strategy: "none", selected: [], availableCount: 0 };
  }

  const tableGroups = options.tableSeatGroups ?? [];
  for (const group of tableGroups) {
    if (group.length < requested) continue;
    const match = exactLabels(available, group.slice(0, requested));
    if (match.length === requested) {
      return { strategy: "table", selected: match, availableCount: available.length };
    }
  }

  const preferred = options.preferredSeatNumbers ?? [];
  if (preferred.length >= requested) {
    const match = exactLabels(available, preferred.slice(0, requested));
    if (match.length === requested) {
      return { strategy: "preferred", selected: match, availableCount: available.length };
    }
  }

  const runs = consecutiveRuns(available);
  const exactRun = runs.find((run) => run.length >= requested);
  if (exactRun) {
    return {
      strategy: "adjacent",
      selected: exactRun.slice(0, requested),
      availableCount: available.length,
    };
  }

  const longest = runs[0] ?? [];
  const selected = [...longest.slice(0, requested)];
  const used = new Set(selected.map((seat) => seat._index));
  for (const seat of available) {
    if (selected.length >= requested) break;
    if (!used.has(seat._index)) {
      selected.push(seat);
      used.add(seat._index);
    }
  }

  if (selected.length < requested && !options.allowPartial) {
    return {
      strategy: "insufficient",
      selected: [],
      availableCount: available.length,
      requested,
    };
  }

  return {
    strategy: longest.length > 1 ? "max-adjacent-plus-any" : "any",
    selected,
    availableCount: available.length,
  };
}

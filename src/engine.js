/** Pure gift-exchange parsing and constrained matching. No DOM or remote services. */
export const NAME_LIMIT = 120;

const norm = value => String(value ?? '').trim();
const key = value => norm(value).toLocaleLowerCase();

export function parseFamilies(text) {
  const families = [];
  const people = [];
  const used = new Map();
  const groupIndex = new Map();
  const rawLines = String(text ?? '').split(/\r?\n/);
  for (const [index, raw] of rawLines.entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    const groupName = colon < 0 ? `Group ${index + 1}` : line.slice(0, colon).trim();
    const members = (colon < 0 ? line : line.slice(colon + 1))
      .split(',').map(norm).filter(Boolean);
    if (!members.length) throw new Error(`Line ${index + 1}: add at least one person.`);
    if (!groupName) throw new Error(`Line ${index + 1}: the group name is missing.`);
    const canonicalGroup = groupName.toLocaleLowerCase();
    if (!groupIndex.has(canonicalGroup)) {
      groupIndex.set(canonicalGroup, families.length);
      families.push({ name: groupName, members: [] });
    }
    const groupNumber = groupIndex.get(canonicalGroup);
    const groupId = `group-${groupNumber}`;
    for (const name of members) {
      if (name.length > NAME_LIMIT) throw new Error(`The name “${name.slice(0, 20)}…” is too long.`);
      if (used.has(key(name))) {
        throw new Error(`“${name}” appears more than once. Names must be unique (including across families).`);
      }
      used.set(key(name), true);
      people.push({ name, group: groupId, groupName });
      families[groupNumber].members.push(name);
    }
  }
  return { families, people };
}

/** Parse one CSV-style line with quote support. */
function parseCsvLine(line) {
  const fields = [];
  let cell = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      fields.push(cell.trim()); cell = '';
    } else cell += char;
  }
  fields.push(cell.trim());
  return fields;
}

/** Accept `Alice -> Bob`, `Alice → Bob`, `Alice, Bob`, or `Alice; Bob`. */
export function parsePairs(text) {
  const pairs = [];
  for (const [index, raw] of String(text ?? '').split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let parts;
    const arrow = line.match(/\s*(?:->|→|\s+to\s+)\s*/i);
    if (arrow && arrow.index !== undefined) {
      parts = [line.slice(0, arrow.index), line.slice(arrow.index + arrow[0].length)];
    } else if (line.includes(';') || line.includes(':')) {
      const indexSep = line.includes(';') ? line.indexOf(';') : line.indexOf(':');
      parts = [line.slice(0, indexSep), line.slice(indexSep + 1)];
    } else {
      parts = parseCsvLine(line);
    }
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
      throw new Error(`Pair list line ${index + 1}: use “Giver -> Recipient” or “Giver, Recipient”.`);
    }
    if (/^(giver|from|person)$/i.test(parts[0].trim()) && /^(recipient|to|receiver)$/i.test(parts[1].trim())) continue;
    pairs.push([parts[0].trim(), parts[1].trim()]);
  }
  return pairs;
}

export function resolvePairs(pairs, people, type = 'Pair') {
  const names = new Map(people.map(person => [key(person.name), person.name]));
  const resolved = [];
  for (const [from, to] of pairs) {
    const giver = names.get(key(from));
    const receiver = names.get(key(to));
    if (!giver || !receiver) {
      const missing = !giver ? from : to;
      throw new Error(`${type}: “${missing}” is not in your participants. Check spelling or add them to a group.`);
    }
    resolved.push([giver, receiver]);
  }
  return resolved;
}

function shuffle(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Each participant gives exactly once and receives exactly once.
 * With finite exhaustive backtracking it either finds a valid arrangement
 * or proves none exists. `maxNodes` protects the browser for huge instances.
 */
export function assignExchange({ people, allowWithinGroup = false, allowReciprocal = false,
  avoidPairs = [], fixedPairs = [], random = Math.random, maxNodes = 500000 }) {
  if (!Array.isArray(people) || people.length < 2) throw new Error('Add at least two people to begin.');
  if (people.length > NAME_LIMIT) throw new Error(`For smooth performance, use at most ${NAME_LIMIT} participants.`);
  const names = people.map(p => p.name);
  const namesSet = new Set(names.map(key));
  if (namesSet.size !== names.length) throw new Error('Each participant must have a unique name.');
  const group = new Map(people.map(p => [p.name, p.group]));
  const resolvedAvoid = resolvePairs(avoidPairs, people, 'Avoid pair');
  const resolvedFixed = resolvePairs(fixedPairs, people, 'Planned pair');
  const avoided = new Set(resolvedAvoid.map(([a, b]) => `${a}\0${b}`));
  const assignments = new Map();
  const used = new Set();
  const staticAllowed = (from, to) => from !== to &&
    (allowWithinGroup || group.get(from) !== group.get(to)) &&
    !avoided.has(`${from}\0${to}`);

  for (const [giver, recipient] of resolvedFixed) {
    if (!staticAllowed(giver, recipient)) {
      throw new Error(`Planned pair “${giver} → ${recipient}” conflicts with an exchange rule.`);
    }
    if (assignments.has(giver) && assignments.get(giver) !== recipient) {
      throw new Error(`“${giver}” has two different planned recipients.`);
    }
    if (used.has(recipient) && assignments.get(giver) !== recipient) {
      throw new Error(`“${recipient}” is assigned to receive more than once.`);
    }
    assignments.set(giver, recipient);
    used.add(recipient);
  }
  if (!allowReciprocal) {
    for (const [a, b] of assignments) {
      if (assignments.get(b) === a) {
        throw new Error(`Planned pairs “${a}” and “${b}” form a forbidden two-way exchange.`);
      }
    }
  }

  // Random tie-breaks / branch order; matching is randomized, not claimed uniform.
  const priority = new Map(shuffle(names, random).map((name, i) => [name, i]));
  let visits = 0;
  let capped = false;
  const canUse = (giver, recipient) => staticAllowed(giver, recipient) &&
    !used.has(recipient) && (allowReciprocal || assignments.get(recipient) !== giver);

  // Necessary matching condition, with each remaining receiver reachable uniquely.
  function hasPossibleMatching(remaining) {
    const matchedTo = new Map();
    function augment(giver, seen) {
      const targets = names.filter(to => canUse(giver, to));
      for (const to of targets) {
        if (seen.has(to)) continue;
        seen.add(to);
        if (!matchedTo.has(to) || augment(matchedTo.get(to), seen)) {
          matchedTo.set(to, giver);
          return true;
        }
      }
      return false;
    }
    return remaining.every(giver => augment(giver, new Set()));
  }

  function search() {
    visits++;
    if (visits > maxNodes) { capped = true; return false; }
    if (assignments.size === names.length) return true;
    const remaining = names.filter(n => !assignments.has(n));
    let chosen = null, choices = null;
    for (const giver of remaining) {
      const available = names.filter(to => canUse(giver, to));
      if (!available.length) return false;
      if (!choices || available.length < choices.length ||
        (available.length === choices.length && priority.get(giver) < priority.get(chosen))) {
        chosen = giver; choices = available;
      }
    }
    if (!hasPossibleMatching(remaining)) return false;
    for (const recipient of shuffle(choices, random)) {
      assignments.set(chosen, recipient);
      used.add(recipient);
      if (search()) return true;
      used.delete(recipient);
      assignments.delete(chosen);
      if (capped) return false;
    }
    return false;
  }
  if (!search()) {
    if (capped) throw new Error('The exchange is unusually complex. Try fewer restrictions or fewer participants.');
    throw new Error('No valid exchange exists with these rules. Try allowing same-group gifts, reciprocal pairs, or removing some exclusions.');
  }
  return shuffle([...assignments], random);
}

export function makeTextExport(pairs) {
  // Deliberately machine-reimportable as next year's avoid-pair file.
  return pairs.map(([a, b]) => `${a} -> ${b}`).join('\n');
}

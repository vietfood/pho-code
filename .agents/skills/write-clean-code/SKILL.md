---
name: write-clean-code
description: Write clean, concise, performance-aware TypeScript/JavaScript by deleting dead code, deduplicating into shared helpers, replacing if/switch chains with data-driven tables, and collapsing boilerplate — while preserving exact observable behavior. Use when writing, editing, refactoring, or reviewing code, and whenever asked to deslop, simplify, or optimize a codebase.
---

# Write Clean Code

Default to the barebone form: the shortest code that preserves exact behavior wins. Every abstraction must pay for itself; every line must earn its place.

## Delete before you polish

Dead code is the purest slop. Remove it first — it shrinks the surface you have to think about.

- A symbol is dead only when a repo-wide search shows zero references, including tests and barrel files. Verify, don't assume.
- Test-only production code is dead: if only tests call it, delete the code and its tests together.
- Deleting a function? Delete its now-unused imports, types, and private helpers in the same edit.
- Deleting a barrel export? Confirm no test imports it through the barrel first.

## Deduplicate — but only real duplicates

Three near-identical blocks earn a shared helper; two usually don't.

- Extract the *exact* shared skeleton; push differences into parameters or data.
- Watch for subtle variants hiding in apparent clones. Example: five `path.relative` containment checks looked identical, but one treated `target === root` as inside and the other four didn't. Merging them blindly would have changed security behavior. Diff the semantics, not the shape.
- Preserve public API and observable DOM (testids, aria attributes, event timing) when merging components — merge the internals, keep the wrappers thin.
- Consolidate repeated stdlib/idiom copies (try/catch storage access, JSON guards, URL checks) into one module per concern.

## Data-driven beats control flow

A lookup table is shorter, clearer, and easier to extend than a branch ladder.

```ts
// Bad
switch (kind) {
  case "agents": return "Context files";
  case "tool": return "Tools";
  default: return "Optional";
}

// Good
const LABELS = { agents: "Context files", tool: "Tools", optional: "Optional" } as const;
return LABELS[kind];
```

- Long `if`/`else if` chains that differ only in constants become an array of rows plus one loop.
- Keep special cases *out* of the table: handle them before or after the lookup, preserving original evaluation order.
- Single-case switches and two-branch switches on a boolean become ternaries or `Set.has` checks.

## Collapse boilerplate

- Repeated `throw createError({ code, message, operation, recoverable: true })` blocks → one `failCommand(operation, message)` helper. If the same call shape appears 5+ times, it wants a helper.
- Conditional object properties → spreads: `...(cursor ? { cursor } : {})`, not four-line ifs.
- Building a result object with many optional fields → build the base, spread conditionals, return once.
- Identical `async () => ({ cancelled: true })`-style literals → one named constant or factory.

## React / UI specifics

- N effects that only sync refs to state → one effect assigning all of them.
- Several `void (async () => { try { ... } catch { guard } finally { guard } })()` wrappers with the same skeleton → one `runTask(generation, fallback, task, done?)` helper; keep genuinely different recovery paths inline.
- Prop drilling through an intermediate component that adds nothing → inline the intermediate or bundle the props.
- Near-identical presentational components (confirm dialogs, chips, menu rows) → one parameterized component + thin wrappers that preserve testids and copy.
- Never let a simplification change focus order, keyboard handling, or aria wiring.

## Performance is a byproduct of less code — plus a few real rules

Less code usually does less work: hoisted invariants, early returns, and flat conditionals are free wins. Beyond that, these are the rules that actually move the needle in TS/JS:

**Complexity before micro-optimization.** An O(n²) loop beats any clever trick. The classic JS trap is spread-in-a-loop:

```ts
// Bad: O(n²) — copies the accumulator every iteration
items.reduce((acc, x) => [...acc, transform(x)], []);

// Good: O(n)
items.flatMap((x) => [transform(x)]); // or a for-loop with push
```

**Allocation is the tax you actually pay.** Every `[...arr]`, `{...obj}`, `.filter().map()` chain, and template literal in a hot path creates garbage. Fuse chained iteration into one pass when the path is hot; build strings with `push` + `join` in tight loops; define regexes at module scope, never inside a function called per item.

**Membership and lookup.** `array.includes(x)` inside a loop is a hidden O(n·m). Build a `Set` once, then `.has`. Same for repeated object-shape checks — precompute the lookup table (which is also the data-driven win above).

**Async.** Independent `await`s in sequence are wasted wall-clock; use `Promise.all` for independent work. But don't parallelize what shares a rate limit, a lock, or an ordering requirement.

**React rendering.** Re-renders are the renderer's allocation problem: keep streaming/token updates from re-rendering whole trees (external stores, keyed lists), keep object/array props referentially stable across renders when children are memoized, and virtualize long lists instead of styling around them.

**Measure, don't guess.** No caching, memoization, workers, or lazy loading without a measured or structural hot path. Speculative optimization is slop with extra steps — it adds code, and code is the thing we're removing.

## Comments and verbosity

- No narration comments (`// increment counter`, `// return the result`). Comments explain *why*, constraints, or non-obvious trade-offs only.
- One attribution/credit line, not an essay.
- If a comment repeats on every copy of a pattern, that's a signal to deduplicate the pattern.

## Guardrails — simplification must not change behavior

- Trace error precedence, `null` vs `undefined`, focus targets, and evaluation order before collapsing conditionals. Write down the original semantics, then match them.
- Conditional spreads and ternaries must reproduce the original branch conditions exactly, including which error wins when several fail.
- Existing tests are the specification. If a refactor makes a test wrong, the refactor is wrong — unless the test itself tested dead code.
- When you cannot run checks, say so: report changes as statically verified only, and name the exact commands that would prove them.

# Paracore v4.8.2

**Windows x64 · .NET 8 · Revit 2025 & 2026**

The release that stops the engine from doing the wrong thing quietly.

Every defect fixed here has the same shape: **something failed and said nothing**, or **something
succeeded and did more than it looked like**. A wrong parameter name returned `0`. A write that
could not happen reported success. A script that wrote and then threw kept its earlier writes. A
background thread could take Revit down. This release closes that class rather than patching
instances of it, and it says so in the reply when it cannot be sure.

Release with **Paracore-Gen v2.1.1**. Install both together.

> **Supersedes v4.8.1, which was tagged and held back.** If you are coming from the last published
> release (v4.8.0), everything in [v4.8.1](Release-Notes-4.8.1.md) is included here as well — the Pack
> SDK, REPL IntelliSense, type-write warnings, `Batch` / `Checkpoints`, the single MCP core and the
> consent dialog. This note covers what 4.8.2 adds on top of that.

## Highlights

- **A failed script is now undone as a set.** Each auto-transacting write commits on its own, so a
  script that wrote and then threw reported `FAILED` while leaving its earlier writes in the model —
  the caller was told "it did not run" and the model said otherwise. Every submission now runs
  inside a `TransactionGroup`: commit on success, roll back on failure. Measured: `SetVal` followed
  by a throw used to leave the comment on the door; it no longer does.
- **And when it cannot be sure, it says so.** A write attempted outside any transaction can be
  *partly* applied by Revit and still throw, and no transaction group can undo a write that was
  never in one. The reply for that case says **`THE MODEL MAY HAVE CHANGED`** and tells you what to
  verify. The old wording, "the model is unchanged", was a false all-clear in exactly that case.
- **A name that does not exist raises.** `SetVal("Fire Ratng", …)` used to be a no-op that reported
  success; it now raises, names the element, and suggests the real parameter. `WhereParam` raises
  when no element in the set declares the name, instead of returning an empty result — so a typo can
  never look like "nothing matched". Reads are softer by design: `GetStr` on an unknown name still
  returns `""`, but logs a one-time warning naming the parameter.
- **A script can no longer take Revit down.** Unbounded recursion overflowed the stack and killed
  the process (`0xc00000fd`) — a crash no exception handler can catch. A guard on the execution path
  now stops it and reports the recursion instead of the process disappearing.
- **A big-looking change is announced before it happens.** A bulk write warns with the element count;
  a write to a *type* parameter says how many instances it will change; a write inside a loop with no
  enclosing `Transact()` warns that it costs one undo entry per element.
- **Numbers are exact where they are used.** `GetNum(name, unit)` no longer rounds the conversion
  before returning it; rounding happens at display (`FormatUnit` / `GetVal`). Takeoff figures shift in
  the last decimals, in the accurate direction.
- **Errors name the line you wrote.** A compile error used to be reported in coordinates that
  included the injected prelude, so the line number was off by a constant. It now maps back to your
  source, and says so only when it can.

## Write safety

### The all-or-nothing envelope

`ReplSessionManager` opens a `TransactionGroup` around one submission and closes it exactly once:
commit when the script returns, roll back when it throws. The granularity *inside* is unchanged — an
un-wrapped loop still commits N times and still costs N undo entries — which is why the granularity
advisory below exists. The envelope only makes the set reversible.

Three outcomes are all reported, including the bad ones:

| outcome | what the reply says |
|---|---|
| rolled back cleanly | `↩ ROLLED BACK — the writes this script had committed inside a transaction were undone.` |
| a raw write ran outside a transaction | the line above **plus** `⚠ … Revit can apply part of such a call and still throw, so THE MODEL MAY HAVE CHANGED.` |
| the rollback itself failed | names the status it got, instead of claiming success |

A read-only submission still opens no group: the pre-filter blanks comments and string literals
before looking for write verbs, so a query that merely *mentions* `SetVal` costs nothing. What it
cannot tell is whether a verb it finds is reachable — a snippet naming a write verb in a dead branch
still opens a group, and that group commits empty. That is a small cost, and it is stated here
rather than claimed away.

### The pre-filter errs wide, on purpose

Missing a write verb is worse than finding a false one: a missed verb means no envelope, which means
no rollback sentence at all. So the list includes raw Revit API writes that are *not* auto-transacted
— `Duplicate(`, `Wall.Create(`, `NewFamilyInstance(`, `ChangeTypeId`, `set_Parameter`,
`Transaction(` — because those are exactly the calls that can half-apply and then throw.

## Security

The pattern scan that guards agent code was written against short type names, and a caller is free
to write the long one. `new Thread(` was refused; `new System.Threading.Thread(` **executed**.
Measured, then fixed in all three lists — dangerous patterns, the read-only guard, and the
file/network policy — plus the add-in's own backstop, which is a fourth list.

The fix is one step, not eleven: the namespace prefix is blanked before any rule runs
(`new A.B.C.Type(` → `new      Type(`), length-preserving so line numbers survive, and **both** the
original and the blanked text are scanned so a rule that keys on a namespace keeps its hit.
`global::` prefixes are covered. A pattern written next month inherits this.

The same pass fixed the mirror-image defect: these scans were reading **prose**. A read-only snippet
containing the comment "never do `new Transaction(Doc)`" was refused as if it opened one. Comments
and string literals are now blanked first, in both layers — fixing only the Python layer left the
add-in refusing the same query one layer down, which is how that was found.

Unchanged and still true: `explore_revit_data` runs its snippet inside a transaction group that is
**always** rolled back, so a model write reached by any route — including reflection, which no
pattern can see — is discarded by Revit rather than refused by a scan.

## Diagnostics and reporting

- **The consent dialog says what it grants.** It previously asked for "access" without saying to
  what; it now names the scope, and the agent is told which answer it got (allowed / already allowed
  / blocked) instead of a bare success it had to interpret.
- **`Pick()` explains itself.** It is a human's tool — it holds Revit's UI thread until you click,
  and nothing it prints reaches the chat before it returns. It now says what it is waiting for, and
  it is not offered to an agent at all. From an agent, select in Revit first: `get_context` returns
  your `Selection`.
- **A gallery corpus miscount.** The gallery reports 33 scripts, not 34.

## Additions

- **`HasParam(name)`** — does this element (or its type) declare the parameter, without raising.
- **`WhereParam("Id", 359588)`** — an element Id is a valid name too (also `"ElementId"`).

## What is not fixed, and is stated as such

- **A target-typed construction names no type** — `StreamWriter w = new(path);` cannot be matched by
  any `new <Type>(` rule. Refusing `new(` outright would refuse `Params p = new();`, which is a
  documented gallery pattern, so this is left open and written down rather than papered over. The
  read-only path is still protected by the always-rollback group; the file policy remains a
  best-effort net, as its own refusal message says.
- **The file/network policy is a scan, not a sandbox.** The reflection *entry points* are refused, so
  a type name assembled from string pieces cannot be resolved to reach `File`, `HttpClient` or
  `Process`. What remains reachable: a delegate obtained from a framework method, and a loop inside a
  framework call. The real boundary is the session consent dialog and the person at the machine.

## Verification

Every claim above was measured on the installed build, not inferred from the diff. The suite that
does it lives in `paracore-gen/spikes/` and its acceptance criterion — one item, one test, one
verdict — is `paracore-gen/Docs/RELEASE_ACCEPTANCE.md`.

| suite | result |
|---|---|
| engine regressions (write safety, parameter resolution, type writes) | 25/25 |
| write safety (609-wall snapshot, drift-checked) | 9/9 |
| bulk warning | 11/11 |
| type-write advisory | 9/9 |
| rollback honesty (live, incl. the outside-transaction case) | 9/9 |
| UI and rendering | 10/10 |
| tool surface | 27/27 |
| security scan, both layers | 51/51 |
| scan bypass (qualified names, prose, containment) | 17/17 · frozen exe 8/8 |
| rewriter / line numbers | 10/10 |
| catalog search | 38/38 |

Model left exactly as found after every run: 609 walls, 27 wall types, 0 comments, 0 probe types.

**Requirements:** Revit 2025 or 2026 · Windows x64 · .NET 8 desktop runtime

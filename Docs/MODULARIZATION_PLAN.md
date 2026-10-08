# Modularization Plan — isolating the Finishing takeoff

Status: **PROPOSAL — for review before any code moves.**
Author: session 2026-09-17. Supersedes nothing; complements `CROSS-REPO.md` and
`Docs/TAKEOFF_SPEC.md`.

The user's framing, verbatim:

> *"The project is overwhelming. it has the engine. the takeoff implementation is just
> added to that without any modularization. … the engine should be isolated. i.e the
> paracore addin that just enables dynamically execute revit api scripts against live
> revit document. then the takeoff is huge by itself. the finishing section of the
> takeoff which we have been all working on is the most difficult of all. … the
> finishing takeoff must be its own isolated mcp instead of part of the larger
> paracore-takeoff mcp. because even when we run it, it is taking too much time to
> calculate finishing for the whole project. we can not optimize it while it is still
> part of other complicated takeoff sections. … i am just extremely confused that what
> seems to be working is just now all failing and this is because of the scale of the
> project."*

This document answers three questions:

1. **Where are we, measured** — not impressions (§1).
2. **Why it feels like everything is failing** — the actual root cause (§2).
3. **What to do, in stages with exit criteria** (§4).

---

## 0. The goal: section isolation

Stated by the user, 2026-09-17:

> *"the goal is to work on each section without affecting the others. so when we work on
> one section of the takeoff, we are sure that we are not affecting or modifying other
> sections in undesirable way."*

This is the acceptance criterion for the whole effort, and it is worth making precise,
because "section" currently means two different things:

- **Takeoff section** — the 12 BOQ sections (§1–§12: earthwork, concrete, structural,
  architectural, finishing, painting, …). This is what the user means.
- **Code module** — the file groupings inside `Globals/TakeOff/`.

**A takeoff section is isolated when all four of these hold:**

| # | Property | Why it matters |
|---|---|---|
| I1 | **Own computation** — its quantities are derived only from model geometry + its own rules | no section may read another section's *output* as an input |
| I2 | **Own inputs** — its parameters/settings are its own | changing a finishing setting cannot move an earthwork number |
| I3 | **Own tests** — it can be exercised headless, without the other sections | this is what makes "did I break something else?" answerable in seconds |
| I4 | **Own failure surface** — a bug in it cannot silently change another section's number | requires a shared *typed* boundary, not shared strings |

Today none of I1–I4 hold, because every section is a set of methods on one
`TakeOffExtensions` class returning formatted strings. The plan below is ordered so that
**I3 and I4 arrive first** (Stage 1), because they are what let you *trust* a change.

---

## 1. Where we are, measured

### 1.1 Code mass

| Project | Files | LOC | Role |
|---|---:|---:|---|
| `CoreScript.Engine` | 118 | **28,229** | Roslyn script host **+ all commercial logic** |
| ├ `Globals/TakeOff/` | 32 | **14,616** | the whole takeoff — **52% of the engine** |
| │ └ *Finishing* (13 files) | 13 | **~6,583** | the hardest part |
| ├ `Globals/` (top level) | 31 | 7,876 | extension methods (shared + pro) |
| └ `Core/` | 29 | 3,568 | infrastructure |
| `Paracore.Addin` | 29 | 7,192 | WPF / ribbon |
| `Paracore.Server` | 3 | 355 | sidecar gRPC host |
| `Paracore.Shim` | 2 | 290 | Revit entry point |
| `rap-server` (MCP, Python) | — | 6,808 | takeoff MCP + its tests |

Finishing, by file:

```
Finishing.Collector.cs          1156     TakeOffFinishing.cs               687
Finishing.Dwa.cs                 699     Finishing.Inspectors.Room.cs      578
Finishing.Exposure.cs            675     Finishing.Inspectors.Beam.cs      564
Finishing.Inspectors.Wall.cs     496     Finishing.Common.cs               416
Finishing.Classifier.cs          323     Finishing.Inspectors.Column.cs    281
Finishing.Inspectors.Slab.cs     280     Finishing.Context.cs              238
Finishing.Shafts.cs              190
```

### 1.2 The two test regimes — the asymmetry that explains everything

| | MCP side (`rap-server`) | Engine side (`CoreScript.Engine`) |
|---|---|---|
| Harness | `pytest`, 9 test files | ad-hoc `.repl/*.cs` + `Docs/*.cs` |
| Runs headless | **yes** | **no — needs a live Revit** |
| Speed | **210 tests collected in 0.91 s** | minutes per round trip |
| Count | 210 tests | ~8 gates + **~30 probe scripts** |
| Covers | BOQ assembly, rates, auth, routing | the geometry + all finishing arithmetic |

**~6,600 lines of the most rule-dense logic in the product sit in the one place that
cannot be unit-tested.** That is the whole problem in one sentence.

### 1.3 The contract facts

- **The gRPC surface is generic.** `protos/corescript.proto` exposes
  `ExecuteScript`, `ExecuteRepl`, `GetContext`, … — there is **no takeoff-specific RPC**.
- **Finishing is reached by name.** The MCP calls `execute_repl` with a script string that
  invokes `GetFinishingTakeoff()` / `GetPaintingTakeoff()`. There is no typed boundary.
- **Results are anonymous types with formatted-string quantities.** Every inspector returns
  `IEnumerable<object>` of `new { Section = …, Element = …, Quantity = "<number as text>", Unit = …, Detail = "…" }`.
- **Public entry surface is 7 methods:**

  ```
  InspectRoomFinishes    InspectWallFinishes   InspectColumnFinishes
  InspectBeamFinishes    InspectSlabFinishes
  GetFinishingTakeoff    GetPaintingTakeoff
  ```

### 1.4 The cross-repo constraint

`CROSS-REPO.md` states `paracore` (public, MIT) and `paracore-pro` (private, commercial)
must keep `CoreScript.Engine/`, `Paracore.Addin/`, `Paracore.Shim/`, `Paracore.Server/`
**identical except** for an explicit list of commercial files — which begins with
`CoreScript.Engine/Globals/TakeOff/ (entire directory)`.

So the takeoff is **already a commercial island inside a shared project**, maintained by
hand-kept "EXCEPT these files" lists. Every new finishing file must be remembered in that
list. This is a standing source of error, and it is an argument *for* the split, not
against it.

### 1.5 Isolation violations, found by building the Stage 0 baseline

These were not theorised — they fell out of writing one script that captures all seven
finishing surfaces at once (`.repl/capture_baseline.cs`). Each is a concrete failure of a
property from §0, and each is invisible when you probe one surface by hand.

**V1 — ALL FIVE inspectors are element-at-a-time, driven by the live Revit UI selection.
(fails I2, "own inputs")**

Every inspector begins by reading `ScriptApi.Selection`, which is
`UIDoc.Selection.GetElementIds()` — **the live Revit UI selection** — and yields an Error row
unless it holds **exactly one** element of the right kind:

| inspector | requires | error row when it does not get it |
|---|---|---|
| `InspectRoomFinishes` | 1 `Room` | `Select ONE room and re-run.` |
| `InspectWallFinishes` | 1 `Wall` | `Select ONE wall and re-run.` |
| `InspectColumnFinishes` | 1 `Column` | `Select ONE column and re-run.` |
| `InspectBeamFinishes` | 1 `Beam` | `Select ONE beam and re-run.` |
| `InspectSlabFinishes` | 1 `Floor`/slab | `Select ONE floor/slab and re-run.` |

Only `GetFinishingTakeoff` (§7) and `GetPaintingTakeoff` (§8) are genuinely **doc-wide**.

Verified live 2026-09-17 by varying the selection and counting rows from
`InspectRoomFinishes`: empty → **1** (Error), TestRoom 845216 → **24**, Verandah 845294 →
**10**, a Wall → **1** (Error).

So there is no way to ask "measure every room" — a sweep must **write global UI state that the
user owns**, one element at a time. A read-only measurement that has to mutate the user's
selection is the definition of an isolation failure. And a *selection-dependent* baseline is
worse than no baseline, because it drifts when the user clicks something: the first version of
`capture_baseline.cs` captured only the **10 Verandah rows** (because 845294 happened to be
selected) and produced four `Not a basic wall.` rows for the element inspectors for the same
reason. Correcting it took the room section from 10 rows to **34**, i.e. 71% of the room
coverage had been missing.

**An earlier revision of this section claimed rooms were doc-wide. That was wrong** — inferred
from a baseline that was itself selection-dependent, which is exactly the failure mode V1
describes. The source and a live probe both disagree with it.

This is also the real reason the REPL gates are so brittle. A gate that inspects an element is
only correct if it also sets the selection first — and the selection it sets is shared with the
user's Revit session, so **the gate and the user can silently invalidate each other**.
`capture_baseline.cs` now saves and restores the selection around its sweep, which is a
mitigation, not a fix. The fix is Stage 2: the measurement layer takes an element id, not a
selection.

**V2 — the engine's chatter is not stable, so nothing self-identifying can be diffed.
(fails I3, "own tests")**

Interleaved with the inspector output, the engine emits `[INFO] …`, `⚠ GetStr("Wall Finish"):
parameter not found on element.`, `[finishes-collector] collector-total=3.8s | …` and
`Pipeline: [6 → 6 → …]`. These vary **between two runs of the same build on the same model**:
the timing line always differs, and a warm-cache run emits `[finishes] collector reused (file)
in 1.1s` where a cold run emits `collector computed in 5.1s` plus the `⚠` warning. The first
baseline therefore differed from *itself* on every run. The data block is now fenced by
`>>>BASELINE-BEGIN` / `>>>BASELINE-END` so only the rows are compared — but note that this
means the `⚠ GetStr("Wall Finish")` warning is **suppressed by the harness**, and it looks like
a latent parameter-name bug that deserves its own look.

**V3 — two inspectors can describe the same surface under different classifications.
(fails I1/I4 in spirit: the sections are not independently composable)**

Column 843090 bounds both TestRoom and the Verandah. The **room** inspector lists it under
`Bounding` for the Verandah and counts `0.988 m²` into the Verandah's `= TOTALS =`; the
**column** inspector reports `Int: 0.702` because it does `if (isExt) continue;` and the
Verandah is `IsExterior = 1`, so that same surface is booked as **Exterior** (3.088). Both are
defensible answers to different questions, and the export (§7 `Interior plaster — columns
3.11` = 0.855+0.855+0.702+0.702) follows the element inspectors, so there is **no
double-count in the export**. But the room table's `= TOTALS = 5.345` for an *exterior* room
reads like interior plaster, and a reader who adds the room tables to the element tables will
double-count. Nothing in the output says which convention a table uses.

---

## 2. Why it feels like everything is failing

The user's instinct — *"what seems to be working is just now all failing"* — is correct,
and the cause is not that the rules regressed. It is **three compounding factors**.

### 2.1 Root cause: quantities are strings, so nothing can be checked arithmetically

Every bug in this session traces to that single fact:

| Finding | What it actually was |
|---|---|
| **D19** | `_WallOpeningArea` returns m²; a script wrapped it in `m2()` and read 0.1756 for a true 1.8900. A *unit* error, invisible because the value was text by the time anyone looked. |
| **D20** | The room `= TOTALS =` printed five terms summing to 64.528 beside a stated total of 63.404. Only discoverable by *parsing display text*. |
| **D20 part 2** | Same class in the beam/slab details. |
| **`leadNum` trap** | A gate reported phantom mismatches because one inspector appends `" m2"` and another does not. |
| **Closed-form `Contains`** | A gate asserted the exact punctuation `"Ceiling: none (IsExterior)"` and silently became a landmine the moment a sibling string changed. |

A string quantity cannot be added, compared, or type-checked. So **"consistency" can only
be tested by re-parsing output** — which is exactly why there are ~8 gates and ~30 probes,
all needing a live Revit. The gate count is not thoroughness; it is the symptom.

### 2.2 The feedback loop is brutally slow

To verify one finishing change today:

1. build (`dotnet build`, ~3 min, with a shell env workaround),
2. **close Revit** (it memory-maps `CoreScript.Engine.dll`, so the install is blocked while
   it is open),
3. run the installer (self-elevating, UAC),
4. reopen Revit + the test project,
5. run the REPL probe, read the text, interpret.

Five steps, two of them manual and one requiring a UAC prompt, per hypothesis. At that rate
"test after test" is not a discipline failure — it is the only thing the architecture
permits.

### 2.3 The scale is real, and it is concentrated

The takeoff is 14.6k lines; finishing is ~6.6k of the hardest part. When a rule changes,
nothing tells you which of the other rules it broke — because there is no executable
statement of the rules. The spec (`TAKEOFF_SPEC.md`, ~2,400 lines, D1–D20) *is* the
statement, in prose. **Prose is not executable**, and this session alone found two places
where the prose itself was arithmetically wrong.

### 2.4 What this means

The user's proposal — isolate finishing — is **right**. But the reason it is right is not
repository aesthetics. It is that isolation is the *only* way to get a fast, headless,
executable statement of the finishing rules. Moving the code without changing the string
contract would relocate the problem, not fix it.

---

## 3. Target architecture

Four layers, each with one job and a typed boundary between them.

```
┌─────────────────────────────────────────────────────────────┐
│ Revit  +  Paracore addin  (SHARED, unchanged across repos)  │
│   • the generic script host: run C# against a live document │
│   • gRPC CoreScriptRunner (ExecuteScript / ExecuteRepl)     │
└───────────────────────────┬─────────────────────────────────┘
                            │  MEASURE  (Revit API — the only
                            │  layer that needs a live Revit)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ MEASUREMENT layer  —  "geometry facts", no QS semantics     │
│   elements × faces: area, normal, centroid, owner, room,    │
│   contact/opening context, buried/grade flags               │
│   → FinishingMeasurement  (typed, serialisable)             │
└───────────────────────────┬─────────────────────────────────┘
                            │  TYPED DATASET (JSON)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ FINISHING  (own project → own repo → LIBRARY)               │
│   • the four-region model, reveals, skirting, aggregation   │
│   • pure arithmetic over the dataset — NO Revit needed      │
│   • unit-tested headless against fixture datasets           │
│   → FinishingResult  (typed rows: decimal + unit + source)  │
└───────────────────────────┬─────────────────────────────────┘
                            │  TYPED RESULT (assembly reference)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ paracore-takeoff MCP  —  merges §7/§8 with the other 11     │
│   sections; no finishing rules of its own                   │
└─────────────────────────────────────────────────────────────┘
```

*(Decision 4: finishing ships as a **library** consumed by `paracore-takeoff`, not as a
separate MCP — a network hop buys nothing when the merge is always local.)*

### 3.1 The split line, and the honest trade-off

**What question 3 was asking, in plain terms.** The engine has to hand *something* to the
finishing library. The only question is *how much work the engine does before handing it
over*. Two extreme choices:

- The engine could hand over **conclusions**: *"this wall face is 7.385 m² of interior
  plaster."* Then finishing only adds things up.
- The engine could hand over **raw geometry**: *"here is a solid, here are its faces, here
  are their normals."* Then finishing decides everything.

The first is small but useless — every contested rule (is it interior? is it hidden by a
coplanar column? is this opening's reveal plaster?) would still live in C#, in the place
that cannot be tested. The second moves everything out, but the payload becomes huge,
because deciding "is this face hidden?" needs the *context* (the neighbouring column's
planes and boxes), not just the face.

So the recommendation is the middle: **the engine emits facts plus their context — never
verdicts.**

| Depth | Engine emits | Finishing decides | Assessment |
|---|---|---|---|
| Shallow | final verdicts (interior/hidden/buried/exterior areas) | only aggregation | ❌ keeps every contested rule in C# — fixes nothing |
| **Middle** ✅ | faces **+ context** (owner, room, adjacent-element planes/boxes, opening boxes) — **facts, not verdicts** | the verdicts and all arithmetic | ✅ the verdicts are exactly the rules we keep changing |
| Deep | raw solids, faces, normals | everything, including contact/containment | ⚠️ largest payload; contact logic needs rich context anyway |

**DECISION (2026-09-17): the middle line.** A useful test for where any given computation
belongs: *"if this rule changed, would we want to re-run Revit to find out?"* If no, it
belongs in finishing. Reading a face's normal and area is a fact; calling it "interior" is
a verdict.

### 3.2 Performance falls out of the same split

The engine already has a file cache with a model fingerprint
(`_finishesCachePath` / `_finishesFingerprint`) and spatial indexes built once per run
(`beamIndex`, `dwaCacheAll`, `curtainHostMap`, per-element solid caches), plus `Stopwatch`
instrumentation throughout `Finishing.Collector.cs`. So the current code is *not*
unoptimised — but the *geometry extraction* is re-walked by each of the 5 inspectors and
both takeoffs, because there is no shared measurement artefact.

Once the measurement dataset is a first-class, cacheable artefact, all seven entry points
read it instead of re-deriving it, and the expensive Revit work happens **once per model
change** rather than once per inspector call. That is the fix for *"taking too much time to
calculate finishing for the whole project"* — and it cannot be done while the extraction and
the rules are interleaved in the same 1,156-line collector.

---

## 4. Staging plan

Each stage has an **exit criterion** that is objectively checkable. Do not start a stage
before the previous one's criterion is met.

### Stage 0 — Freeze the baseline *(no code moves)* — **DONE 2026-09-17**

- Pin today's numbers as the reference: `Docs/verify_*` suites + the room/element tables for
  TestRoom 845216 and Verandah 845294, captured to a file.
- Complete the rule inventory (§5) as an explicit list, each rule with: statement, the
  defect it came from, and the number that proves it.
- **Exit criterion:** every rule in §5 has a named current value; a single script can
  re-capture the whole baseline and diff it.

**Built:** `.repl/capture_baseline.cs` + `.repl/baseline.py`.

```bash
python .repl/baseline.py capture 2026-09-17_d21   # -> Docs/baseline/2026-09-17_d21.txt
python .repl/baseline.py check                    # re-capture, diff vs newest, exit 1 on drift
python .repl/baseline.py diff <a> <b>
```

**Exit criterion MET.** One script captures all seven surfaces — the five inspectors plus
`GetFinishingTakeoff` (§7) and `GetPaintingTakeoff` (§8) — into one 188-line artifact (131 data
rows), and
`check` re-captures and diffs it. **`check` is IDENTICAL on a re-run**, which is the property
that makes the whole staging plan work: from here on, "did I break another section?" is a text
diff, not an install cycle.

Two design decisions were forced by the model, both worth keeping:

- **Rows are sorted, and dumped by reflection as `name=value` over properties sorted by
  name.** Revit's iteration order is not stable, so an unsorted dump would show phantom diffs
  forever; and dumping the *shape* means Stage 1's move to typed rows shows up in the diff as
  a shape change, which is exactly the evidence Stage 1 needs.
- **The data block is fenced by `>>>BASELINE-BEGIN/END`.** The engine's chatter is not
  reproducible between runs (§1.5 V2), so only the fenced rows are compared.

**Two defects this artifact made visible immediately** — both the D19/D21 class (a nominal
figure standing in for a real one), and neither findable by probing one surface by hand:

| # | Defect | Evidence in the baseline |
|---|---|---|
| **D22** | **The `= WALL =` header dimensions are NOMINAL, not the solid.** | Wall 843119 prints `= WALL = … 3.6m x 2.65m` (= 9.54 m²), but its own next row says `Total vertical: 5.83 m2` — the DWA cuts 2.6 m off the wall. A QS reading the header is misled by **3.71 m²**. Same for the DWA case generally. |
| **D23** | **A room's `  Bounding` rows do not sum to its own `= TOTALS =` decomposition.** | **Col bucket only.** TestRoom 845216: `0.855+0.855+0.702+0.702 = 3.114` vs `Col: 3.115` (**−0.001**). Verandah 845294: `0.988+0.988 = 1.976` vs `Col: 1.975` (**+0.001**). Wall, Beam and Ceiling reconcile exactly. |

#### D23, measured precisely — `Docs/verify_room_totals_reconcile.cs`

The new gate (checks A–F, tolerance **0.0005**) runs against the installed build and returns
**`2 failed, 0 skipped`** — both failures are check A, the Col bucket, and nothing else:

| Check | TestRoom 845216 | Verandah 845294 |
|---|---|---|
| **A** Col term == Σ rounded column rows | **FAIL** 3.114 vs 3.115 (−0.001) | **FAIL** 1.976 vs 1.975 (+0.001) |
| B Beam term == Σ rounded beam rows | PASS 4.316 | PASS 0.720 |
| C walls == Σ rounded wall rows | PASS 39.980 | PASS 2.650 |
| D jambs+reveals == Σ synthetic rows | PASS 0.865 | — (no jambs) |
| E Wall term == walls+jambs+reveals | PASS 40.845 | — |
| F Ceiling term == `  Ceiling` row | PASS 15.128 | — (exterior) |

**Why the D20 gate could not catch this, and why that is not a flaw in it.** §8 of
`verify_room_element_consistency.cs` already asserts "the printed terms of `= TOTALS =` sum to
its own Quantity" — and it **passes**, because it rebuilds the sum from the TOTALS row's *own*
terms (`2.650 + 1.975 + 0.720 = 5.345` ✓). It can only ever prove the totals row is
self-consistent. D20 was a **1.124 m²** self-contradiction and that gate is sized for it. D23
lives one level up — *section vs decomposition* — and nothing compared those two. **The gate's
tolerance is 0.005, five times the size of D23; a gate that cannot see a 0.001 gap must not be
the one guarding a 0.001 defect.** Hence the new gate at 0.0005.

**Mechanism — one number, two rounding boundaries.** The bucket term is `Math.Round(Σx, 3)`
while each row is `Math.Round(x, 3)`. For the Verandah `round(0.9875) + round(0.9875) = 1.976`
but `round(0.9875 + 0.9875) = round(1.975) = 1.975`. **The same code path rounds UP on one room
and DOWN on the other**, so the sign is data-dependent — no display tweak can fix both, which
rules out the "just round the display" fix outright.

**The Wall bucket passes only by luck.** Its parts happen to be exact at 3 dp on this model
(`2.65 + 10.865 + 7.385 + 9.54 + 9.54 = 39.980`), so round-of-sum and sum-of-rounds coincide. A
model whose wall areas land on `0.9875` would break it identically. The gate therefore checks
**every** bucket, not just the broken one, so the next model cannot reintroduce the defect in a
bucket we "verified".

#### D23 — the fix needs a QS ruling, not a code decision

All three candidates move a printed commercial number, so this is a measurement-policy call:

| # | Fix | Verandah | TestRoom | Cost |
|---|---|---|---|---|
| **(a)** | **Sum-of-rounded-parts.** Make each bucket term the Σ of its rounded rows, so the table always adds up by construction. | Col `1.975 → 1.976`, total `5.345 → 5.346` | Col `3.115 → 3.114`, total `63.404 → 63.403` | Table becomes auditable; the *total* drifts 0.001 **away from the collector's** value, and `1.976` is the less accurate number (true Σ is 1.975). |
| **(b)** | **Largest-remainder allocation.** Keep the accurate total, force the parts to sum to it by shaving the residue off one row. | Col stays `1.975`; rows become `0.987 + 0.988` | Col stays `3.115`; rows become e.g. `0.856+0.855+0.702+0.702` | Table adds up **and** the total stays accurate; one row is distorted by ≤0.0005. Standard financial-reporting practice. |
| **(c)** | **Leave the total; annotate the residue.** | — | — | Honest but the reader still has to reconcile by hand. |

**(a) is rejected on accuracy grounds**: it makes the table consistent by making the number
wrong. **(b) is the principled fix** — the total is authoritative, the parts are presentation, and
the residue is allocated rather than multiplied. It is also exactly what the typed contract in
Stage 1 makes possible: with `decimal` quantities and **one** rounding point at the presentation
boundary, `0.9875 + 0.9875 = 1.9750 → 1.975` for both the rows and the term.

**Deliberately not fixed yet.** Fixing it requires touching `Finishing.Inspectors.Room.cs`, which
would change the Stage-0 baseline — and the whole point of the staging is that a behaviour change
is a *separate, reviewed diff*, not something smuggled in with a refactor. The gate is in place
first, failing, so the fix has a target to turn green and a permanent guard afterwards.

### Stage 1 — The typed contract *(still in-repo)* — **STARTED 2026-09-17**

**The plan as written:**

- Define `FinishingMeasurement` and `FinishingResult` as real types.
- Make the 5 inspectors emit `FinishingResult`; keep the current string tables as a **thin
  view** over it, so nothing user-visible changes yet.
- **Exit criterion:** the string tables are byte-identical to today's output, but the
  numbers behind them are `decimal`/`double`, and a script can assert
  `result.Total == Σ parts` **without parsing text**.

This is the stage that removes the pain. Everything after it is mechanical.

**Built (room inspector first — it is the one with a proven defect):**

| file | change |
|---|---|
| `Globals/TakeOff/Finishing.Contract.cs` | **NEW.** `FinishingBucket`, `RoomFinishingMeasure`. Carries UNROUNDED decimals; the single rounding boundary is the display. |
| `Globals/TakeOff/Finishing.Inspectors.Room.cs` | `InspectRoomFinishes(this Document doc, RoomFinishingMeasure? sink = null)` — fills the sink from the SAME doubles the rows are formatted from. Plus `MeasureRoomFinishes()` (selected room) and `MeasureAllRoomFinishes()` (every room, saves/restores the UI selection). |
| `Globals/TakeOff/ScriptApi.TakeOff.cs` | The two new methods exposed to scripts. |

**The change is ADDITIVE on purpose.** The emitted rows are untouched — same rows, same order,
same property names — so the rendered table and the Stage 0 baseline must be **byte-identical**.
That is the Stage 1 exit criterion, and it is what makes this verifiable rather than hopeful.
Callers that pass no sink behave exactly as before.

**The number the user actually asked for** — *"total interior plaster (soffits + walls + columns
+ vertical beam) ... per room"* — is `RoomFinishingMeasure.InteriorPlasterM2`, an exact decimal
sum, with `InteriorPaintM2` as the same surface. No text parsing required.

**Gate:** `Docs/verify_room_measure.cs` asserts two different things, and the distinction matters:

1. **FAITHFUL** — the typed total must equal the table's own `= TOTALS =` row (3 dp, tol 0.0005).
   Otherwise the contract is a *second* source of truth, which is worse than none.
2. **EVIDENCE** — `Σ(bucket decimals) == bucket decimal` to within **1e-9**. This is the entire
   reason for the contract: on the string side that same relation is off by 0.001 (D23), because
   there are two rounding boundaries. In the decimal domain there is no rounding until display.

   The 1e-9 is **not a rounding tolerance** — it absorbs floating-point *summation order* (the
   accumulator adds in face order, the evidence sums in key order, and double addition is not
   associative), which is ~1e-15. It is a million times tighter than the defect it replaces, so a
   real gap still fails loudly. A tolerance of 0 would fail on arithmetic noise and teach nothing.

**VERIFIED LIVE 2026-09-17 on `E8189838CA770AA8`** (the installed Debug build):

```
.repl/baseline.py check            -> IDENTICAL — (no section moved)
Docs/verify_room_measure.cs        -> 0 failed, 0 skipped
```

**Exit criterion MET:** not one row of any of the seven finishing surfaces moved.

```
TestRoom 845216   Walls 40.845 | Cols 3.115 | BeamsVert 4.316 | Soffit 15.128  -> 63.404  (table 63.404)
Verandah 845294   Walls  2.650 | Cols 1.975 | BeamsVert 0.720 | Soffit  0.000  ->  5.345  (table  5.345)
BUILDING          plaster 68.749        soffit 15.128
```

**And the two gates together are the definitive proof of the D23 diagnosis:**

| gate | domain | Col bucket |
|---|---|---|
| `verify_room_totals_reconcile` | printed strings | `3.114` vs `3.115` → **fails by 0.001** |
| `verify_room_measure` | typed decimals | `3.1150` vs `3.1150` → **passes at 1e-15** |

**Same data.** The 0.001 gap exists **only in the display rounding**. The contract did not mask D23
— that gate is still `2 failed, 0 skipped` — it *isolated* the defect to the presentation layer.
So D23's fix is now trivially verifiable: fix the display, both gates go green.

**One latent gap found while writing the gate:** `Finishing.Inspectors.Room.cs:193` does
`beamTotal += sa` in the calculator pass with **no matching `elems` entry** (the comment says the
beam pass below owns the rows). Every other accumulator contribution has a matching bucket. It
reconciles with `d 0` on `TakeOff_Test` because `sa` is 0 there — but on a model where the
calculator reports a non-zero framing area, the Beam total would carry a contribution with **no
evidence row**. The gate has a comment naming this; a non-zero delta there is a finding, not noise.

**Still to do in Stage 1:** the other four inspectors (wall, column, beam, slab). Their `Quantity`
is genuinely polymorphic — a plain number for some rows and a compound `Int: X | Ext: Y` for
others — so they need the compound case modelled, not just `decimal`.

#### Constraint found before starting: **row shape == visible columns**

`InspectRoomFinishes().Table()` does not render from a fixed column list. It goes
`Table<T>` → `Output.Table(data)` → `MaterializeForSerialization(data, expandElements: true)`,
which **converts each anonymous type to a dictionary and serializes it to JSON** for the Summary
tab. So **every public property of a row becomes a column.**

That invalidates the obvious reading of "emit a typed row": the inspectors currently emit
**33 distinct property sets** across the 131 baseline rows — some rows carry `Id`, some carry
`Detail`, some carry neither:

```
Detail,Element,Id,Quantity,Section,Unit          (32 rows)
Detail,Element,Quantity,Section,Unit             (29 rows)
Detail,Level: 02 - Ground Floor Plan,...         (20 rows)   <- a sub-quantity as a COLUMN
Detail,Buried (below ground): 0 m2,Total vertical: 4.8 m2,... (many)  <- ditto
```

Note what those last two are: **typed sub-quantities published as prose columns.** A beam row
carries `Top (in slab)`, `In slab (sides)`, `Buried (below ground)`, `Total vertical (paintable)`
and `Total soffit` as five separate *columns*, and a slab row carries `Hidden (beam/column
contacts)` and `Grade slab`. So the consumer of "buried area" must read a column whose **name** is
an English sentence.

**Consequence for Stage 1:** unifying every row onto one 6-property type would *add columns to
every table the user sees*. "Byte-identical string tables" is therefore achievable only if the
typed row preserves each row's **exact property set** — i.e. the view must be projected from the
typed result with the shape carried along, not flattened. The typed contract's real payload is
**the named sub-quantities** (`Fields`), not just `Quantity` as a `decimal`.

The baseline is the right instrument for this: because it dumps the shape, the Stage-1 diff will
show exactly which rows gained or lost a column, and that diff is the review artifact.

#### BLOCKER, measured 2026-09-17 — the extraction has a prerequisite

Before moving any file, the 15 finishing files were copied into a **scratch project that
referenced only `RevitAPI` / `RevitAPIUI`** and built. Nothing in the repo was touched; the
compiler was used as the dependency oracle. Two results came back.

**1. The external symbol set is 17, not 54.**

```
5 types            ScriptApi · LicenseContext · BOQSectionParameter · TakeOffTimings · FinishingSettings
6 private helpers  _resolvedZone · _isCurtainWall · _getMaterial · _typeName
                   _collectBeamSideArea · _getStairRunGeometry
1 level helper     GetLevelName
5 extension methods GetStr · GetNum · GetInt · ResolveParam · InputUnit
```

Every other error in the probe output (`CS8130`, `CS1503`, `CS0119`, `CS0019`, the `CS0165`)
was *downstream* of these — type inference collapses once `GetNum`/`GetStr` are missing. They
are symptoms, not dependencies. The earlier "54 distinct symbols" figure counted **every
identifier**, not the ones that actually fail to resolve; this probe supersedes it.

**2. The real blocker: `TakeOffExtensions` is a `partial class`.**

```
14 of the 15 finishing files declare  partial class TakeOffExtensions
32 files in total declare it            (18 of them other sections)
14,998 lines total
```

The 14 finishing files are not a module that happens to sit in a folder. They are **woven
into one class** with `TakeOffConcrete`, `TakeOffMasonry`, `TakeOffSteel`, `TakeOffRoofing`,
`TakeOffMEP`, `TakeOffGlazing`, `TakeOffJoinery`, `TakeOffRailing`, `TakeOffEarthwork`,
`TakeOffCurtainWalls`, `TakeOffStructural`, `TakeOffBOQ`, `TakeOffClassification`,
`TakeOffValidation`, `TakeOffSchedules`, `TakeOffCore`, `TakeOffArchitectural` and
`TakeOffMetalWork` — sharing the six private helpers above by virtue of being the same class.

**A partial class cannot span assemblies.** So `Paracore.Finishing` cannot exist until
`TakeOffExtensions` is split. That split *is* the section-isolation work; the extraction is a
consequence of it, not a prerequisite for it.

**Correction to the earlier estimate.** The "only 5 lines of host coupling" measurement
counted `ScriptApi.Selection` call sites. That measures the **selection** coupling — which
really is five lines, and really is just an input. It does not measure **type** coupling, and
the type coupling is what blocks the move. The estimate was right about the selection and
wrong about the cost of the boundary.

**Corrected first step — DONE 2026-09-17. See §4.1 below.**

### 4.1 In-place modularization of the finishing section — **DONE 2026-09-17**

**Decision (user, 2026-09-17): do NOT isolate finishing as a project or library yet.** The
goal is that the finishing section is *well organized and modularized where it sits*, so that
extracting it later is mechanical. A separate assembly is deferred, not abandoned.

**What was done.** The 14 finishing files that joined `partial class TakeOffExtensions` now
declare their own `public static partial class FinishingExtensions`, still inside the engine:

| | files | class |
|---|---|---|
| finishing section | **14** | `FinishingExtensions` |
| every other takeoff section | **18** | `TakeOffExtensions` |

Bodies did **not** move. Moving them cascades — `_resolvedZone` needs `_topRuleCategories`,
`GetLevelName` needs `_levelParamCache` + `_resolveLevelValue` — so instead:

1. the ten cross-used helpers went `private static` → `internal static`
2. `using static` directives were added only where a file genuinely borrows from the other
   class (15 files); the 17 that did not need it were pruned back out
3. explicit `TakeOffExtensions.<finishing member>` calls were re-pointed
4. `ShaftCtx`, nested in the class and returned by `_StairShafts`, went `private` → `internal`

**The seam, measured:** 26 helper references across 15 files — 10 finishing files reaching into
`TakeOffExtensions`, 5 other-section files reaching into `FinishingExtensions`. Gate:
`.repl/verify_module_boundary.py`, which fails if the seam **grows**.

**A trap worth remembering:** extension methods imported via `using static` work in
`x.Method()` syntax but **not** as unqualified static calls. `GetFinishingTakeoff(d)` failed
with `CS0103` until it was written `FinishingExtensions.GetFinishingTakeoff(d)`. Extension
methods also resolve through the shared namespace anyway, so they are *not* counted as seam.

**Why this is worth having even without the assembly:** the finishing section is now a named,
countable thing. "How coupled is finishing to the rest of the takeoff?" has an answer (26), and
that number can be driven down one helper at a time — each move independently verifiable
against the Stage 0 baseline.

### Stage 2 — Extract `Paracore.Finishing` *(DEFERRED — drain the seam first)*

- New project referencing only the measurement contract — **no script-host dependency**.
- New test project with **fixture datasets** (a JSON measurement dump is a test input).
- Port rules one at a time, asserting ported output == Stage 0 baseline.
- Retire the corresponding `Docs/verify_*` REPL gate as each rule gets a fixture test.
- **Exit criterion:** the finishing suite runs headless in seconds, with the same coverage
  as the REPL gates it replaced.

### Stage 3 — wire the library in

- Engine exposes `MeasureFinishing` (extraction only).
- `paracore-takeoff` references `Paracore.Finishing` and calls it for §7/§8.
- **Exit criterion:** `paracore-takeoff` §7/§8 output is unchanged, but produced by the
  library; `paracore-takeoff` contains no finishing rules. (A separate MCP was considered
  and **rejected** — decision 4.)

### Stage 4 — Performance

- Measurement dataset cached by fingerprint (extends what exists).
- Re-profile with the existing `Stopwatch`/`TakeOffTimings` instrumentation.
- **Exit criterion:** whole-project finishing measured, and the per-inspector re-walk
  eliminated.

---

## 5. Rule inventory (the migration checklist)

Every rule must survive the move. This is the list to port, one at a time, each with the
number that proves it.

### 5.1 The model

- **Four regions per face:** Interior / Hidden / Buried / Exterior
  (`Exterior = totalVert − interior − hidden − buried`).
- **Face extent:** centroid + min/max from triangulation — *not* `Evaluate(UV(0.5,0.5))`,
  which lands off trimmed faces (**D10**).
- **Coplanar contact** hides a face (**D5**); the exempt-box test must use a point **on the
  material** (**D19**).
- **Opening reveals** from the wall's **own solid**, no column attribution (**D16/D19**):
  `(Σ jamb heights + Σ head width + Σ sill widths) × thickness`.
- **Soffit ≠ ceiling** — a slab/beam underside is a soffit (**D17**).
- **Ceiling** = room plan area − beam plan footprints + exposed beam soffits + DWA head
  strips (**D8**).
- **Curtain-wall head strip** is the FULL beam width (**D9**).
- **Grade slab / buried** divider at the ground level (**D15**).
- **Wet rooms** tile instead of plaster/paint.
- **IsExterior rooms**: no jambs, no head strips; slab/beam soffits are exterior soffits.
- **Beam soffit display** snaps to 2 dp via `_Q2` — **deliberate**, do not "unify" (**D12
  rejected**).
- **Every summary's printed terms must sum to its own total** (**D20**); every top-level
  `|` term is a real summand, anything excluded says so in a parenthetical.

### 5.2 Rules that are WRONG today and must be fixed as part of the move

These are new, user-reported on 2026-09-17, and they are the first regression tests of the
new harness.

**(a) Skirting — currently `room.Perimeter × (1 − SkirtingDoorDeductionPct/100)`.**
The user's ruling:

> *"if a room is exterior … we can just take the boundary segments of the walls and columns
> in that room and calculate the skirting, i.e. leaving out the other room separation line.
> but for an interior room where there are curtain walls, doors, or other openings, it is
> the same. the room perimeter is not the skirting length, because we have to subtract the
> door's width, etc."*

**Verified live on Verandah 845294.** The boundary loop is 11.700 m:

| Segment | Length |
|---|---:|
| Room Separation 844425 | 1.700 |
| Room Separation 844314 | 4.000 |
| Room Separation 844585 | 1.700 |
| Wall 843119 — **nominal** run | 3.600 |
| StColumn 843090 faces | 0.200 + 0.150 |
| StColumn 843091 faces | 0.150 + 0.200 |

`11.700 × 0.92 = 10.764` — what the inspector prints. The correct answer is **1.700 m**:

- **7.400 m** is room separation lines — no physical surface.
- Wall 843119's nominal run is 3.600 m but its **solid** is 1.000 m: DWA **848303**
  occupies **2.600 × 2.650**, and the wall's own vertical faces are `2.650 + 2.650` (long)
  `+ 0.265 + 0.265` (ends). So `3.600 × 2.650 = 9.54` minus the 6.89 DWA opening = 2.65,
  exactly the interior claim.
- **1.000 (solid wall) + 0.700 (column faces) = 1.700 m** ✓ — the user's number, exactly.

The 8% flat deduction is a global fudge that removes 0.936 m where 2.600 m is required.
TestRoom 845216 is over-reported the same way (prints 14.260 m; should also drop the 0.900
door and the same 2.600 DWA).

**This is the D19 defect class again:** `Room.Perimeter` is the *nominal* boundary loop,
the truth is the *solid material* facing the room. The engine already has `_FaceExtent`,
`_WallOpeningArea` and `_DwaJambFaces` to get the real run.

**(b) Free-standing non-bounding walls have no skirting.** The user:

> *"there are free standing walls that are not room bounding. but this wall since it is in
> interior, it has skirting around it. just like the partition wall in the test room. but i
> don't think its skirting is calculated."*

Correct — the engine already tracks non-bounding walls for *plaster*
(`nonBoundingByRoom`, and partition 850560 shows as 0.265 m² on wall 843112), but skirting
is derived from `room.Perimeter`, which by definition excludes them.

### 5.2.1 The skirting rule — FINAL (user ruling 2026-09-17)

Skirting is **per exposed vertical face**, like plaster — **not** per room-boundary segment.
The user's two rulings together:

> *"assume a room like the test room. it has a door. so the door opening should skip the
> skirting. there is another partition wall which has one of its shorter faces touch the
> wall and one is free standing in the room. the wall is like 200 cm long. but this is
> completely inside a room. **whether this wall is "Room Bounding" or not doesn't matter on
> how it gets skirting. i.e it should just get skirting all around. i.e 4.1 meters of
> skirting. (2 + 2 + 0.1).**
> if there are interior partition walls that have curtain walls (curtain wall base offset
> with zero, i.e starts from the floor), then that part should be skipped. … dwa do not need
> skirting. but some of them may be hosted in walls. so the part of the wall that is not cut
> by the curtain wall needs skirting."*

> *"dwa, if base offset is zero, no skirting at that dwa opening. this dwa might even not
> have a host wall at all. **so we only supply skirting to basic or stacked walls. no curtain
> wall needs skirting.** so if it is hosted and if the curtain wall base offset is not zero,
> then it means the host needs skirting, since it is a solid wall. but if it is completely
> cut at the bottom (base offset zero), that part of the wall where that curtain wall cuts it
> doesn't need skirting."*

**The rule, stated operationally:**

| Surface | Skirting? |
|---|---|
| **Basic** or **Stacked** wall face facing a room | **yes** |
| **Curtain** wall (any), and any DWA span with **base offset = 0** | **no** — it is glazed to the floor |
| DWA span with **base offset ≠ 0**, hosted in a Basic/Stacked wall | **yes** — the wall below the sill is solid |
| Wall **end face** that abuts another element | **no** |
| Wall **end face** that is free | **yes** |
| Door / window opening in a wall | **no** — skip the opening width |
| **Column** face exposed to a room | **yes** |
| **Room separation line** | **no** — no physical surface |
| **Free-standing** wall, bounding or not | **yes, all around** — both faces + free ends |

**The worked example (partition 850560, TestRoom):** 2.00 m long, 0.10 m thick, one end
abutting a wall, one end free → `2.00 + 2.00 + 0.10 = **4.10 m**`. Note this is exactly the
"all around" case: the two long faces both count, and exactly one of the two end faces does.

**Verified live on Verandah 845294** (boundary loop 11.700 m → prints **10.764**, correct
**1.700 m**):

| Segment | Length |
|---|---:|
| Room Separation 844425 | 1.700 |
| Room Separation 844314 | 4.000 |
| Room Separation 844585 | 1.700 |
| Wall 843119 — **nominal** run | 3.600 |
| StColumn 843090 faces | 0.200 + 0.150 |
| StColumn 843091 faces | 0.150 + 0.200 |

- **7.400 m** is room separation lines → no skirting (rule: separation line).
- Wall 843119 is a Basic wall, nominal run 3.600 m, but its **solid is 1.000 m**: DWA
  **848303** occupies **2.600 × 2.650** with base offset 0, and the wall's own vertical faces
  are `2.650 + 2.650` (long) `+ 0.265 + 0.265` (ends). `3.600 × 2.650 = 9.54` − the 6.89 DWA
  opening = 2.65, exactly the interior claim. → **1.000 m** (rule: DWA at base offset 0).
- **1.000 (wall) + 0.700 (column faces) = 1.700 m** ✓ — the user's number, exactly.

The 8% flat `SkirtingDoorDeductionPct` is retired as a *global fudge*: it removes 0.936 m
where the rule requires 2.600 m. (The setting may survive as an explicit, per-opening
deduction if a QS wants one — but it must no longer stand in for real geometry.)

**STATUS — IMPLEMENTED + WIRED (2026-09-17).** This is the first rule migrated under the
target architecture, and it was done as a *pilot* of the Stage-1/2 shape: a self-contained
module `CoreScript.Engine/Globals/TakeOff/Finishing.Skirting.cs` (240 lines, no edits to the
engine core), wired at the three existing call sites by replacing one expression each. It was
prototyped in the REPL **before** any C# module existed (`.repl/skirt_proto.cs`), which is the
fast loop the plan argues for — the algorithm was correct and both targets exact
(**Verandah 1.700 / TestRoom 16.100**) before a single rebuild.

Two traps were found and are documented in the module header, because both are silent:

1. **A solid's face normal points OUT of the solid — i.e. INTO the room.** The containment
   probe must go along `+normal`. The first implementation used `−normal` and kept only the
   *end* faces: it read **0.900** for the Verandah (target 1.700).
2. **Sampling the boundary and counting proximity hits bleeds past a base line's ENDS** by the
   tolerance — it read **1.036** for a **1.000** run. Use the **analytic overlap** of the base
   line's projection onto the segment; a perpendicular base line (a wall end face) then
   projects to a degenerate interval and contributes 0 with no special case.

Spec: `Docs/TAKEOFF_SPEC.md` **§D21**. Gates: `.repl/skirting_d21.cs` (live, post-install) and
`.repl/verify_build_contains.py` (static, `0 failed, 45 passed`).

**TestRoom 845216 target:** boundary loop 15.500 m (separation 0, wall 14.400, column 1.100)
→ prints 14.260 m today. Correct = loop − 0.900 (door 861205) − 2.600 (the same DWA) +
4.100 (partition 850560, all around) = **16.100 m** — to be confirmed by the ported rule,
not by hand.

**This is the D19 defect class once more:** `Room.Perimeter` is the *nominal* boundary loop;
the truth is the *solid material* facing the room. The engine already has `_FaceExtent`,
`_WallOpeningArea` and `_DwaJambFaces` to get the real run — plus
`CurtainWall.BaseOffset`/`BaseAttachmentType` for the base-offset test.

---

## 6. Decisions (all resolved 2026-09-17)

| # | Question | Decision |
|---|---|---|
| 1 | Skirting on interior partitions: both faces or one? | **Per exposed face, both faces.** "whether this wall is Room Bounding or not doesn't matter … it should just get skirting all around. i.e 4.1 meters (2 + 2 + 0.1)". So skirting is **per-face**, like plaster — not per boundary segment. |
| 2 | Does skirting follow *solid* material or deduct openings only? | **Solid material.** Only Basic/Stacked walls get skirting; curtain walls never. A DWA with **base offset = 0** removes skirting across its span; with base offset ≠ 0 the host wall below it is solid and **keeps** skirting. |
| 3 | Split depth — "facts, not verdicts"? | **Decided: the middle line** (§3.1). Engine emits faces + context; finishing decides the verdicts. |
| 4 | Separate MCP or library? | **Library.** "i think a Library is more logical than a separate MCP." So: `Paracore.Finishing` as a library consumed by `paracore-takeoff`. Stage 3 becomes "extract the library", not "new MCP". |
| 5 | Does the public `paracore` repo get the measurement layer? | **Out of scope for now.** "We don't have to touch anything in the public paracore repo. it can just sit there for some time until we decide to modify to make it the same with the paracore-pro repo." The plan must therefore not *depend* on a public-repo change; treat `CROSS-REPO.md` sync as a later, separate concern. |

### 6.1 Consequence of decision 4 for the staging plan

Because finishing becomes a **library** rather than an MCP, the boundary is a
**.NET assembly reference + a typed result**, not a network hop. That is cheaper and
faster, and it removes the JSON-serialisation requirement from Stage 2 (JSON is still
useful for *fixture tests*, but it is no longer the production path). Stage 3 shrinks to:
"`paracore-takeoff` calls the library instead of the engine's finishing methods."

---

## 7. What NOT to do

- **Do not start by moving files.** A physical split without the typed contract relocates
  the problem and adds versioning/CI cost.
- **Do not rewrite the rules.** They are hard-won (D1–D20) and correct in isolation. The
  job is to *isolate* them, then fix the two known-wrong ones (§5.2) as the harness's
  first tests.
- **Do not add more REPL gates.** Each new one is evidence the architecture is forcing
  manual verification. Replace, do not accumulate.

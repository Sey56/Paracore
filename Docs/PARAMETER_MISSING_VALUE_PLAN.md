# Missing parameters reading as `0` — investigation and plan

Status: **Phase 0 IMPLEMENTED 2026-11-07** — a name the category does not declare now throws
in `GetStr` / `GetNum` / `GetInt` (see §5). Built and installed on Revit 2025 and 2027 the same
day; the release containing it is deliberately deferred. Phases 1-3 below remain OPEN.
Sections 1-4 are the investigation record and describe the behaviour BEFORE the fix.
Reported: 2026-11-06, desktop REPL on Revit 2027.

```csharp
GetElements<FamilyInstance>("Doors")
    .Where(dr => (dr.Host as Wall)?.WallType.Kind == WallKind.Curtain)
    .Select(dr => new
    {
        dr.Id,
        dr.Name,
        Type = dr.GetStr("Type"),
        Family = dr.GetStr("Family"),
        Base_Offset = dr.GetNum("Base Offset", "cm"),
        Top_Offset = dr.GetNum("Top Offset", "cm")
    })
    .Table();
```

Two doors, `Base_Offset` and `Top_Offset` both `0`, **no warning**. A misspelled name
(`"Fire Ratng"`) does warn. The expectation, correctly stated: a parameter that does not
exist on the element should be *flagged*, not printed as a measurement.

---

## 1. How a read resolves today

`GetNum(name, unit, decimals)` is a wrapper and adds no diagnostics of its own:

```csharp
public static double GetNum(this Element e, string name, string unit, int decimals = -1)
    => e.GetNum(name).OutputUnit(unit, decimals);
```

Everything happens in `GetNum(this Element e, string name)`
(`CoreScript.Engine/Globals/ElementParamExtensions.cs:542`):

| # | Route | Produces a value when |
|---|---|---|
| 1 | `e.ResolveParam(name)` → `LookupParameter`, then the `Paracore ` alias maps | parameter found **and** `HasValue` |
| 2 | `Enum.TryParse<BuiltInParameter>(NAME_UNDERSCORED)` → `e.get_Parameter(bip)` | BIP exists on the element **and** `HasValue` |
| 2b | `"Id"` / `"ElementId"` | always (answered from the element) |
| 3 | C# property by reflection (`IgnoreCase`) | property exists and is `double`/`float`/`int` |
| 4 | type hop: `type.GetNum(name)` **gated** on `_declaresParameter(type, name)` | type declares it |
| 5 | fall through | `return 0.0` |

Before returning the `0.0`, exactly one diagnostic is attempted:

```csharp
if (!_declaresParameter(e, name))
    _warnUnknownParameter(e, name, "GetNum");
return 0.0;
```

`_declaresParameter` (`:189`) answers *"does this name mean anything here?"* through
**five** routes, deliberately broader than the value path:

1. `e.ResolveParam(name) != null`
2. a case-insensitive scan of `e.Parameters` names
3. `Enum.TryParse<BuiltInParameter>(...) && e.get_Parameter(bip) != null`
4. `e.NativeProperties()` — any row whose `Property` matches
5. the same, on the element's **type**

`_warnUnknownParameter` (`:284`) is a side channel: it prints via `ScriptApi.Println`,
deduped per name by a set of element ids — first sighting, then every 25th. It never
touches the returned value.

The table path is separate and value-blind:

```
.Table()  →  ScriptApi.Table(object)  →  Output.Table  →  Output.Show("table", data)
          →  MaterializeForSerialization(data, expandElements:true)   // anonymous → Dictionary
          →  JsonSerializer.Serialize(…, ExecutionGlobals.SerializerOptions)
          →  _context.AddStructuredOutput("table", json, capExempt)
          →  rap-web StructuredOutputViewer.tsx / OutputPanel.tsx
```

By the time a cell is serialized it is just a JSON number. `0` and "no such parameter"
are the same byte sequence.

---

## 2. Why "Base Offset" produces a silent `0`

Three distinct defects, and this case hits at least one of them.

### (a) The existence check is broader than the value path — asymmetry

> **CORRECTED 2026-11-06 by live measurement.** An earlier draft of this document claimed
> `BASE_OFFSET` / `TOP_OFFSET` were `BuiltInParameter` members and that the enum route was
> satisfying the gate. **That was wrong** — a `grep` hit in `RevitAPI.dll` was a false
> positive. The probe below shows `<no enum>` for both names, and the gate's verdict ("no
> such parameter") is **correct**. The asymmetry is real but it is *not* what caused this
> report.

The gate answers *existence* through five routes; `GetNum` answers *value* through two.
They can disagree, and when they do the failure is silent — but in this case they agreed.

### (b) `LookupParameter` can miss a parameter that exists — a *wrong* zero, not a missing one

The file's own comments record this as measured behaviour (`:199`): `LookupParameter`
returned `null` for a name that was present in the element's parameter set, in the same
session, with no rebuild. `_declaresParameter` was hardened for it by scanning the set —
but **only the gate scans the set; the value path still starts from `LookupParameter`.**
So the sequence

```
ResolveParam → null        (volatile API miss)
… set scan → found         (gate: exists)  ⇒ no warning
return 0.0                 (value never read)
```

produces a silent `0` for a parameter that **does exist and holds a non-zero value**.
That is strictly worse than a typo, and it is invisible.

### (c) `GetNum` cannot represent "missing"

`double` has no empty state, and `0.0` is a legitimate measurement (a door with zero
base offset is utterly normal). Once projected into an anonymous type the provenance is
gone, so `Table()` cannot mark the cell.

---

## 2b. MEASURED 2026-11-06 — paracore-gen probe against live Revit 2027

Probe: `_scratch/probe_param_resolution.py` via `mcp/grpc_client.execute_repl`,
read-only, door id `376493` ("90cm door", Category **Doors**).

```
--- 'Base Offset' ---
  LookupParameter            : null
  LookupParameter(Paracore~) : null
  BuiltInParameter enum      : <no enum>
  get_Parameter(bip)         : null
  in instance parameter SET  : False
  in TYPE parameter SET      : False
⚠ GetNum("Base Offset"): no such parameter on any of 50 elements
  GetNum                     : 0
  GetNum(unit=cm)            : 0
  GetStr                     : ''
```

`Top Offset` is identical. Conclusions:

1. **The name genuinely does not exist** on this category — no route resolves it.
2. **Detection already works.** The engine produced the correct verdict, including the
   "wrong for this whole set" wording.
3. **The verdict never reaches the data.** It is a `Println`; the value is still `0`, and a
   table cell is a JSON number. The reported symptom is a *delivery* failure, not a
   detection failure.
4. The probe printed "any of 50 elements", proving `_warnedParams` already held ids from
   the reported run — so those warnings **were** emitted. They were simply not in the table.

## 3. What must not be assumed

Which of (a)/(b) produced *this* result is not yet established, and the fix differs:

| Hypothesis | Distinguishing evidence |
|---|---|
| (a) gate satisfied by the BIP enum route, no value | `.CombinedParams().Table()` on one of those doors does **not** list `Base Offset` |
| (b) parameter exists, read path missed it | `.CombinedParams()` **does** list it, with a real value |
| (c) legacy alias resolved to a real shared parameter | a `Paracore Base Offset` shared parameter exists and is genuinely 0 |

**First task in implementation:** one discovery run (see §6) to classify the case before
changing behaviour. A fix for (b) that is applied to (a) would hide the miss differently,
not remove it.

---

## 4. Options

| Option | Effect on a missing parameter | Cost | Verdict |
|---|---|---|---|
| **NaN sentinel** from `GetNum` | arithmetic goes NaN; cell can be rendered as `—` | no signature change | **Reject.** `ExecutionGlobals.SerializerOptions` sets no `NumberHandling`, so `NaN` throws on serialize; enabling `AllowNamedFloatingPointLiterals` then emits `NaN`, which is not valid JSON and breaks `JSON.parse` in rap-web |
| **`double?` on new accessors** (`GetNumOrNull`, `TryGetNum`) | `null` survives JSON as `null`; renderer prints `—` | additive, no break | **Accept in phase 2** — but only new code benefits |
| **Unified resolver** (one function answers both "value" and "declared") | gate and read can no longer disagree; fixes (b) outright and makes (a) warn | contained, no API change | **Accept in phase 0** — highest value per line |
| **Per-run parameter audit attached to the table payload** | column marked in the UI even though cells stay numbers | engine + rap-web | **Accept in phase 1** — the only option that helps *existing released scripts* |
| **Throw on a missing name** | loud | breaks whole pipelines over 5 000 elements | reject for tables; keep for filters (`_requireDeclaredParameter` already does this for `WhereParam`) |
| **Typed cell (`ParamValue { Name, Value, IsMissing, Scope }`)** | best long-term | largest | phase 3, if the audit proves insufficient |

---

## 5. Recommended plan

> **IMPLEMENTED 2026-11-07 (phase 0 of 4; phases 1-3 are still open).** `_throwIfCategoryLacksParameter` in
> `ElementParamExtensions.cs` now runs on the read-failure path of `GetNum`, `GetStr` and
> `GetInt`, and throws:
>
> ```
> GetNum("Top Offset"): there is no "Top Offset" parameter in Category Doors.
> Did you mean "Top Level Offset"? Use .CombinedParams().Table() to list the real names.
> ```
>
> Verdict comes from a per-category index (bounded 50-element sample, instance + type,
> cached per process), mirroring `ContextHandler.GetCategoryParameters`. It runs **only**
> where the read already failed and would have returned `0`/`""`, so no call that yields a
> value can change. Phases 1-3 below remain open.

### Phase 0 — one resolver, used for both answers
Introduce a single internal resolver returning `(Parameter p, Route route, bool declared)`,
preferring the **parameter set scan** over `LookupParameter` (the file already documents
that the set is authoritative). Then:

- `GetNum` reads through it → (b) becomes a correct value instead of `0`.
- the warning gate asks the *same* resolver → the two can no longer disagree.
- when the name is declared but has no readable value, distinguish it in the message:
  `"declared, but this element has no value for it"` vs `"no parameter of that name"`.

No public signature changes; `Table` output unchanged in this phase.

### Phase 1 — make the miss visible in the table (the actual ask)
`GetNum` records every unresolved `(name, elementId, reason)` in a per-run audit on
`ExecutionGlobals` (the same object that already owns `PipelineDiagnostics`). `Output.Show`
emits it beside the rows — a `warnings` sibling field, exactly the way `cap_exempt` was
added. rap-web renders:

- the affected **column header** marked (⚠), and
- one footnote line per distinct name: `⚠ "Base Offset": not present on 2/2 elements`,
  or `…: declared but empty on 2/2`, or `…: not present on 1 480/2 000 elements` for
  partial coverage.

This is what turns the current console-only hint into something a reviewer sees *in the
table they are reading*, and it works for scripts already written.

### Phase 2 — additive typed accessors
`double? GetNumOrNull(e, name)` / `bool TryGetNum(e, name, out double v)`, rendered as `—`
when null, with a header marker. `GetNum` keeps its `double` contract and its
documented caveat.

### Phase 3 — optional strictness
`GetNumStrict` throwing like `_requireDeclaredParameter`, for callers who would rather
fail than measure.

---

## 6. Test plan

| # | Case | Expectation |
|---|---|---|
| 1 | Walls + `"Base Offset"` | real value, no audit line (walls declare it) |
| 2 | those doors + `"Base Offset"` | non-zero-or-explicit-missing; audit line (this report) |
| 3 | `"Fire Ratng"` | audit + `Did you mean "Fire Rating"?` |
| 4 | a parameter that exists but is empty | value path says empty; **not** "does not exist" |
| 5 | a parameter that exists, non-zero, whose `LookupParameter` misses | **value returned** (regression test for §2b) |
| 6 | 2 000-element pipeline | one audit line, not 2 000; table still renders |
| 7 | Revit 2025 vs 2027 | identical output |
| 8 | MCP path (`cap_exempt` table) | warnings survive summarisation/truncation |

Discovery run for §3, to be done first:

```csharp
GetElements<FamilyInstance>("Doors").First().CombinedParams().Table()
```

---

## 7. Open questions

1. Does `.CombinedParams()` on those doors list `Base Offset` / `Top Offset` (and with what
   value)? This classifies (a) vs (b) vs (c).
2. Should a *partially* declared name (present on some elements in the set) warn — and at
   what coverage threshold before it becomes a footnote rather than noise?
3. Does rap-web's `StructuredOutputViewer` already handle a `null` cell, or does it
   stringify? Phase 2 depends on this.
4. `_warnUnknownParameter`'s "first + every 25th" policy predates structured output. With a
   per-run audit the console line can become a single summary; confirm that is wanted.

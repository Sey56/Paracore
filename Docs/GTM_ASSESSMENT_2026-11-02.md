# Go-to-market assessment — 2026-11-02

> **STATUS: CURRENT** — this is a dated assessment, not a spec. It argues a position
> and proposes a plan. Re-read it against the artifact before acting; a plan that
> describes a state the artifacts contradict is wrong, and the artifacts win.

**Question it answers:** after three years of building, why is there no reach, and what
should the next ninety days contain?

**Short answer:** the bottleneck stopped being the product roughly two years ago. What is
missing is not capability, reach or brand — it is *evidence*. There is no reference
project, no before/after number, and no client who will say "they did this for me."
Everything else on the list is downstream of that one hole.

---

## 1. What exists

| Layer | What it is |
|---|---|
| `CoreScript.Engine` + `Paracore.Addin` | Live C# + RevitAPI execution against the open model. The substrate. |
| `rap-web` (Tauri) + `rap-server` (FastAPI + gRPC) | Paracore Desktop: script editor, gallery, mass-edit tables. |
| `corescript-vscode` | Script authoring and execution without the desktop app. |
| `paracore-gen` | Generalist MCP: natural language → script → run. |
| `paracore-takeoff` | Takeoff and BOQ extraction for Ethiopian construction. Service, not a tool for sale. |
| `paracore-forge`, `paracore-family`, `paracore-model` | Domain MCPs, shipped. |
| `paracore-standards` | Model checker (PASS/FAIL/UNKNOWN). Private, unfinished. |
| `SynCad`, `CadCleaner` | Outside this ecosystem: CAD→Revit conversion, and cleanup of Revit-exported CAD. |
| `paracore-business`, `paras-marketplace` | Commercial docs, service listings, storefront. |

Service lines derived from takeoff: ParasPlaster, ParasPaint, ParasConcrete,
ParasAluminum, ParasMasonry — the same extraction, sliced by project stage. Plus
**Training** (mass-edit tables, small REPL scripts).

---

## 2. What is genuinely strong

**The capability is real and rare.** Live C# + RevitAPI execution, a REPL, an in-model
sandbox that confines file writes to one workspace, offline execution. Not a wrapper.
Most "AI for Revit" products are chat that writes code you paste, or a cloud service that
cannot touch the model. This runs *in* the model, *on the machine*, and can be shown to
be unable to do damage. To a firm afraid of handing over a client's design, that last
part is worth more than any feature.

**The service model is correct for this market.** Nobody here is buying an add-in
licence. They buy deliverables. A takeoff and a BOQ already have a price, an owner (QS or
estimator) and a signature. Selling into an existing budget line beats creating a new one.

**The chain is complete and maps to how contractors buy.** Model check → fix → takeoff →
BOQ, with stage slices. A contractor at plaster stage does not want a full takeoff. The
packaging is right — as *quote line items*, not as brands (§5).

**Burn is near zero, so a slow face-to-face cycle is affordable.** A funded competitor has
to show growth this quarter and will chase volume with something generic. You can afford
to sit in one studio for three weeks and learn how plaster is actually priced. That is the
only structural advantage, and it is a real one.

**SynCad and CadCleaner are the best door-openers, not side projects.** CAD→Revit and
"Revit-exported CAD is garbage" are felt daily, visible in ten seconds, and
non-controversial. A takeoff pitch asks them to believe a number. A cleanup pitch asks
them to look at their own file.

---

## 3. What is actually wrong

**Breadth is now hurting.** Platform, desktop, VS Code, five MCPs, a standards checker,
two CAD tools, six service lines, training, a marketplace, brochures — roughly twelve
products for a team of effectively one. None is finished enough to survive a hostile
demo, and every hour on `paracore-standards` is an hour not spent in a studio. Shipping
more is comfortable; selling is not. That is the trap.

**"Done" means "done for me", not "done for a stranger."** At the time of writing: 19
uncommitted files, an engine build not installed, five stale MCP executables, a red gate,
nothing pushed. The work is good; the *releasability* is not. A demo that dies because the
installed DLL is two days old costs the office permanently, and in a market this small the
story travels. **Demo reliability is a bigger commercial risk than any missing feature.**

**MEP is a hole, not a caveat.** Declare it in the first five minutes, in writing:
"architectural and structural takeoff today; MEP quoted separately." Discovered by a GC
mid-project, it is fatal. Declared up front, it reads as someone who knows their own
limits — rare, and a selling point.

**The brochures and six service pages are premature.** Artifacts of a company that has
customers. They convince nobody who has not seen an output, and they cost maintenance plus
the illusion of progress. Park them: one page, one number, one form.

**Brand fragmentation.** Five `Paras*` names nobody has heard, plus a parent nobody has
heard. Six things to remember when the market knows zero. Keep them as quote sections. If
a client ever says "I only need plaster", then it is a product.

**Single point of failure.** One person owns delivery, support, sales and training. Fine
for now, but pricing must reflect it and delivery must be standardised enough that job
five costs less than job one.

**The AI-cheapening fear is half-right.** In two years a client could plausibly run a
takeoff with a general model and a Revit connector. What they will not have: the rate
library, the judgement about what to exclude, the Ethiopian BOQ item conventions, or
**someone accountable for the number.** A QS signs; software does not. Sell
accountability, not automation.

---

## 4. The next ninety days

### Weeks 1–2 — one demo that cannot fail
Freeze features. One narrative: *"give us the model, we hand back a checked model and a
priced BOQ."* Then make it boring:

- a tagged, installed build; engine, add-in and every MCP exe from the same commit;
- a sample model owned outright — never a client's;
- a rehearsed 20-minute run, and a recorded video as fallback for when Revit misbehaves
  on their laptop;
- commit, close the gate, install, rebuild the exes.

Unglamorous, and the highest-value engineering of the quarter.

### Weeks 2–6 — one pilot, paid, documented like a case study
One firm, one real project, a small fee — even a token amount. Free pilots die because
nobody has a reason to show up or hand over data. Charge so they commit. In exchange, two
things in writing: permission to use anonymised numbers, and a testimonial.

Measure: their estimated hours before, hours after, element count, defects the model check
found. **Those numbers are the entire future sales deck, and there is not a single one
yet.**

### The wedge — a free model-health audit
Thirty minutes, no obligation: they send a model, the check runs, they get a two-page
report of what is wrong — unjoined walls, unnamed families, duplicates, whatever the
checker surfaces.

Why this one:

1. instant value, requires trusting nothing;
2. it demonstrates the engine without asking them to believe AI;
3. it costs almost nothing — the tool already exists;
4. it ends with *"we can fix these, then do your takeoff"*;
5. it gets into offices that will never take a "buy our software" meeting.

Ten of these is a more realistic first quarter than any amount of outreach.

### Who — ten, not a hundred
- 3–4 studios already modelling in Revit (CAD-only firms cannot feel the pain yet);
- 2–3 contractors with a QS on staff;
- 1–2 cost consultants;
- plus the institutional route: EIABC and the architects' association are where
  credibility concentrates. A guest lecture or short course earns reach advertising
  cannot buy here — and doubles as the training product.

---

## 5. Pricing and packaging

- **Per project, quoted by size and complexity**, anchored to a fraction of a QS fee.
- **Never hourly** — it punishes speed and caps income.
- **Never subscription** — the market will not buy it.
- **Two tiers:** takeoff only; takeoff + model fix.
- **Training separately**, cheap, low-risk, high-margin. The easiest yes available: two
  days on mass-editing via the table export. They leave having *used* the platform, which
  is what the takeoff sale needs first.
- **`Paras*` names stay inside the quote**, not on the masthead, until someone asks.

---

## 6. Stop doing

- Polishing the four finished MCPs.
- `paracore-standards` until a client asks for compliance checking.
- Brochures (already closed — keep it closed).
- Site expansion.
- Any feature no pilot asked for.

---

## 7. The uncomfortable part

The next ninety days should contain almost no new code. If code is written, it is
demo-hardening and the audit report generator — nothing else.

That will feel like standing still. It will be the most productive quarter since 2023,
because the missing thing is not capability. It is one client who will say your name out
loud to another client.

---

## Appendix — evidence for §3, measured 2026-11-02

```
git status --short | wc -l        19 modified, 5 untracked, all uncommitted
VERSION                           4.8.2
HEAD                              91debc7f  (main)
engine Debug DLL                  2026-11-01 15:13:06, 434,176 B
newer .cs than that DLL           none  (build is current with source)
installed engine (per log)        ab87c495762c @ 08:46 — file-confinement work NOT live
MCP exes                          all five stale vs mcp_core/tool_helpers.py
last gate                         18 green / 3 red (all three: build newer than install)
```

⚠ These are the numbers behind the "done for me, not for a stranger" claim. Re-measure
before quoting them; a doc that records artifact state is a snapshot.

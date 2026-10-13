# Paracore UI — Modernization Audit (2026-10-11)

**Status:** findings only. No code changed by this document except where noted.
**Companion:** `PARACORE_UI_RESEARCH_AND_ROADMAP.md` (2026-07-30) — the strategic roadmap. This
document is the **current-state audit** that sits underneath it. Read that one for the design
landscape and the long-range plan; read this one for what is actually true of the code today.

> ⚠ The July roadmap's §1 stack table is **out of date**. It lists PrimeReact, HeadlessUI and
> Heroicons as current dependencies. All three are **gone** from `rap-web/package.json` (verified:
> 0 occurrences each). Its principles and phases are still worth reading; its *inventory* is not.

---

## 0. Why this pass exists

The user's brief, in his words:

> *"i feel there is still a lot of things to make it modern, feel light weight... instead of having
> three themes it is better to have just two themes... in general make the code more performant and
> remove unnecessary leftover code, or redundancies... it doesn't mean adding more stuff, but just
> clean, elegant, crisp, and simple and so inviting."*

So: **subtraction, not addition.** Every recommendation below is either *remove*, *unify*, or
*re-tune*. Nothing here asks for a new feature.

---

## 1. Method

Everything below was measured against the working tree, not recalled:

| Claim type | How it was checked |
|---|---|
| Dependency presence | `rap-web/package.json` |
| Library usage counts | `grep -rl <pkg> --include=*.ts --include=*.tsx src` |
| Orphaned files | `grep -rn <Component> src` excluding the file itself |
| Theme handling | every file matching `theme` under `src/`, read individually |
| Theme tokens | `src/styles/themes.css`, `globals.css`, `custom.css` read in full |
| Editor capability | `src/features/automation/components/ScriptInspector/monacoSetup.ts` |

---

## 2. The theme decision: three themes → two

### 2.1 What exists today

`src/context/ThemeProvider.tsx` defines `ThemeType = 'light' | 'midnight' | 'eclipse'` and applies
them as **CSS classes on `<html>`**:

| Theme | Classes applied | Character |
|---|---|---|
| `light` | *(none)* | slate-50 ground, white panel |
| `midnight` | `dark` | slate-900 ground, blue accent |
| `eclipse` | `dark eclipse` | neutral matte grey, softer accent |

### 2.2 Recommendation: **two themes — `light` and `dark` — plus a `system` option**

Keep `light`. Collapse `midnight` and `eclipse` into a single `dark`. Add `system` as a *third
option* that is not a third palette (it resolves to one of the two by `prefers-color-scheme`).

Why this is the right call, in evidence:

**a. The toggle cycles, so it is unpredictable.** `toggleTheme` walks `light → midnight → eclipse →
light`. Clicking a toggle labelled "theme" and landing on a *different* theme than you expect is a
small but constant friction; with two states it is a boolean, which is what a toggle means.

**b. `eclipse` is not a theme, it is a patch over `midnight`.** `themes.css` does this:

```css
.dark:not(.eclipse) { /* midnight tokens — Tailwind slate palette left ALONE */ }
.dark.eclipse {
  /* eclipse tokens ... AND */
  --color-slate-900: #21252b;   /* it redefines the whole Tailwind palette */
  --color-slate-800: #1b1e23;
  ...
}
```

Eclipse overrides **nine** `--color-slate-*` values; midnight overrides **none**. So every component
written with raw palette classes (`bg-slate-800`, `text-slate-300`) renders correctly in eclipse and
**wrongly** in midnight. That single asymmetry is the mechanical cause of *"i don't think everything
is themed the same."* It is not a styling oversight — it is an architectural one: two competing
theming strategies are live at once (semantic tokens *and* raw Tailwind palette classes).

**c. The alias block is written three times.** `themes.css` lines 102–114, 116–128 and 130–142
declare the same twelve aliases (`--border`, `--text-primary`, `--text-secondary`, `--bg-hover`,
`--accent-hover`, `--tooltip-bg`, `--tooltip-text`, `--success`, `--success-muted`, `--danger`,
`--danger-muted`) once per theme — with values that are identical except `--tooltip-*`. Twelve
aliases × three blocks, for two values that actually differ. One `:root` block plus two overrides of
the two differing values does the same job.

**d. There are dead theme branches.** `FloatingCodeViewer.tsx:64` tests `theme === 'dark'` — but
`'dark'` is a **CSS class**, never a value of `ThemeType`. That branch can never be true.
`monacoSetup.ts:24` has the same confusion from the other direction: `DARK_THEMES = new Set(['dark',
'midnight', 'eclipse'])` includes `'dark'`, which is unreachable. These are the fingerprints of the
same class-as-value mix-up, and they are exactly what a two-theme model deletes.

### 2.3 A real bug this uncovered: **toasts never follow the app theme**

`src/components/ui/sonner.tsx` is the only file in the app that imports `next-themes`:

```tsx
import { useTheme } from "next-themes"
const { theme = "system" } = useTheme()
```

But the app's theme comes from **its own** `ThemeProvider` (`src/context/ThemeProvider.tsx`) — there
is **no `next-themes` provider mounted anywhere**. So `useTheme()` from `next-themes` never sees the
app's theme and always falls back to `"system"`.

Two consequences:

1. Pick `midnight` on a light-mode OS and **the toasts render light**. They follow the operating
   system, not the app.
2. `sonner`'s `theme` prop accepts `"light" | "dark" | "system"`. The app's values are `midnight` and
   `eclipse` — neither is valid, so even if the provider were wired up, the prop would be wrong.

**Fix is three lines:** read the app's own theme, and map it to `'light' | 'dark'`. `next-themes` then
has no importers and can leave `package.json`.

---

## 3. Redundancy and leftover-code audit

Measured today. This is the "remove unnecessary leftover code" half of the brief.

### 3.1 Duplicate libraries shipping at once

| Concern | Library A | Library B | Note |
|---|---|---|---|
| Icons | `@fortawesome/*` — **59 files** | `lucide-react` — **8 files** | Both bundled. lucide is used mostly inside shadcn-derived primitives. |
| Syntax highlighting | `react-syntax-highlighter` — **3 files** | `monaco-editor` — **3 files** | Two highlighters, two themes, two sets of quirks. |

**Recommendation — icons:** pick one. 59-vs-8 makes Font Awesome the incumbent; the honest
counter-argument is that lucide is the modern default and tree-shakes per-icon while Font Awesome
ships an icon registry. Either way, **shipping both is not a choice** — it is an accident of
incremental edits. Decide once.

**Recommendation — highlighters:** `monaco-editor` is already loaded and already the REPL's editor.
`react-syntax-highlighter` survives in `CodeViewer.tsx` and `ExecutionHistory.tsx`. Consolidating
onto Monaco is the smaller end-state (one highlighter, one theme mapping) but Monaco is a heavy
read-only renderer for a short snippet. **A third option is cheaper than both:** these are short
code excerpts — a ~40-line tokenizer is enough, and neither library is needed. Decide on measurement,
not taste: check what each surface actually renders.

### 3.2 Orphaned files

- **`src/features/automation/components/ScriptInspector/REPLCodeEditor.tsx`** — **0 importers.**
  This is the old Prism textarea editor, superseded by `MonacoReplEditor.tsx`. It still pulls in
  `react-syntax-highlighter` and still carries a third copy of the theme→style mapping. Deleting it
  is the single highest-value-per-line change in this document.

  ⚠ Confirmed at `HEAD` earlier that it *was* imported by `ReplModeContent.tsx`; the Monaco rewrite
  removed that import. Nothing else references it.

### 3.3 Odd dependencies

- **`shadcn`** is in `dependencies` (not `devDependencies`). It is a **CLI**, not a runtime library —
  it should never be bundled. Move it, or drop it.
- **`next-themes`** — one importer, and it is the wrong one (see §2.3).
- **`@base-ui/react`** and **`shadcn`** and **`cmdk`** and **`motion`** were all added by the July
  roadmap's plan. Verify each is actually *used*, not merely installed — the July doc's own lesson was
  that PrimeReact and HeadlessUI sat in `package.json` unused for months.

### 3.4 The `dark:` prefix problem (carried over from the July roadmap)

Still open, and now measurable: the `dark:` variant appears throughout component JSX, which is the
duplicate-theming problem in miniature. Every `bg-white dark:bg-slate-900` is a place a third theme
can go wrong — and §2.2b shows it already does.

---

## 4. What "clean, elegant, crisp, inviting" means in practice

Generic advice is useless, so each principle below is stated as a **rule with a test you can apply to
a screenshot of your own app.**

### 4.1 One accent, and it means something

**Rule:** exactly one accent hue carries *interaction*; all other color is state (error, warning,
success) or nothing.

**Test:** count the distinct hues on a screen that are not conveying state. The REPL header alone
carries **eight** icon buttons whose hover states use **three** different hues — blue (font −, reset,
+, Open, Save, Save As), green (New/Clear) and amber (Recent Files) — plus a blue active-snippet
label and a red Remove inside the popover. Five hues on one 48 px strip, none of them meaning
anything beyond "this is a button". Color is decoration here, not meaning.

**Action:** icon buttons are *neutral at rest*, accent on hover/focus, and color only where the action
is destructive. The REPL header should read as one calm row.

### 4.2 Hierarchy from type and space, not from boxes

**Rule:** reach for weight, size and spacing before borders, dividers and shadows.

**Test:** how many horizontal rules and card borders are visible at once? The REPL playground draws a
header border, a section border, a controls border, plus panel borders — four rules for three regions.

**Action:** delete dividers that separate things already separated by whitespace or a background
change. Keep a rule only where it marks a genuinely different region.

### 4.3 Fewer, larger targets

**Rule:** a control that is hard to hit is a control that will be mis-hit.

**Test:** the REPL header's icon buttons are `p-1.5` around a `text-xs` icon — roughly 24 px, below
the 32 px comfortable minimum and well below the 44 px touch target. The font stepper's inner buttons
are `w-6 h-6` (24 px).

**Action:** raise icon buttons to a consistent 28–32 px hit area with the *visual* icon staying small.
The perceived density does not change; the error rate does.

### 4.4 Motion with intent, and short

**Rule:** motion explains a change of state; it does not decorate. 150–200 ms, ease-out, and it must
be interruptible.

**Test:** today transitions are `transition-colors` and `active:scale-95` — which is already the right
instinct. The gap is *entrance/exit*: menus and modals appear instantly.

**Action:** one shared motion token (duration + easing) applied to the recent-files popover, modals,
and panel swaps. Do **not** add spring physics for their own sake.

### 4.5 Every state is designed: empty, loading, error, success

**Rule:** a surface is not finished until all four states exist.

**Test:** the recent-files menu has a real empty state (`No recent files yet.`) — good. The main
editor area has a placeholder. But the output/history panel and the gallery are worth the same
scrutiny.

**Action:** audit each panel for the four states; the empty state is where "inviting" is won.

### 4.6 No dead controls

**Rule:** a control that cannot act is either disabled *with a reason* or absent.

**Test:** the Save button is correctly disabled when the buffer is empty. The theme toggle is the
counter-example — it always works but its *outcome* is unpredictable (§2.2a).

### 4.7 Consistency is a feature

**Rule:** the same concept looks the same everywhere.

**Test:** §2.2b and §3.1 are both consistency failures — two theming strategies, two icon sets, two
highlighters. Users read inconsistency as low quality even when they cannot name it.

**Action:** this is the actual content of "make it feel modern". A UI with one accent, one icon set,
one theme model and one spacing scale reads as *designed*; the same UI with three of each reads as
*assembled*.

---

## 5. Performance notes

Ordered by expected payoff, not by effort:

1. **Delete `REPLCodeEditor.tsx`** (§3.2). Removes a whole editor + its highlighter import from the
   graph.
2. **Consolidate icon libraries** (§3.1). Whichever way you choose, one of the two leaves the bundle.
3. **Consolidate highlighters** (§3.1).
4. **Lazy-load Monaco.** `monaco-editor` is the single heaviest dependency in the app and it is only
   needed when the REPL tab is open. It is currently pulled in by the automation feature. A dynamic
   `import()` at the editor boundary keeps it out of the initial chunk — the July roadmap's §5.5 has
   the general shape.
5. **Move `shadcn` out of `dependencies`** (§3.3).
6. **Measure before and after.** `rollup-plugin-visualizer` is already a devDependency, so the
   before/after is one command rather than an opinion.

---

## 6. What the July roadmap got right, and what moved

| July roadmap item | Status today |
|---|---|
| §3.6 Semantic token refactoring | **Still open, and now the highest-value item.** Evidence in §2.2b/§2.2d. |
| §3.3 Command palette | **Done** — `components/common/CommandPalette.tsx` exists, `cmdk` installed. |
| §3.4 Keyboard shortcuts | **Partly** — `hooks/useKeyboardShortcuts.ts` exists; the REPL has Ctrl +/-/0. |
| §3.2 Motion | **Partly** — `motion` is a dependency; usage to be confirmed. |
| §3.1 shadcn/ui + Base UI | **Partly** — both installed; adoption appears partial, hence §3.1's duplicates. |
| §1 stack table | ⚠ **Stale** — PrimeReact / HeadlessUI / Heroicons no longer exist here. |
| §5.1 Provider Hell | ⚠ **Unchanged and verified** — `AppProvider` alone nests **8** providers (Notification → Auth → Revit → Watchdog → Script → ScriptExecution → Console → Playlist), and `main.tsx` wraps those in `ThemeProvider` + `TooltipProvider` = **10** levels. |

**Read the July doc for direction; do not read its inventory as fact.**

---

## 7. Prioritized plan — cheapest first

### Tier 0 — do now (hours, no design decisions)
1. Delete `REPLCodeEditor.tsx` (0 importers).
2. Fix the sonner theme (§2.3) — three lines, and it is a **visible bug**.
3. Move `shadcn` to `devDependencies`.
4. Remove the two dead theme branches (§2.2d).

### Tier 1 — the theme consolidation (a day, one decision)
5. Collapse to `light` + `dark`; make `system` an option, not a palette.
6. Rewrite `themes.css`: one `:root`, one `[data-theme="dark"]` block, aliases declared **once**.
7. Choose the strategy: semantic tokens **or** raw palette classes — not both. The July roadmap §3.6
   already argues for semantic tokens; §2.2b here is the evidence for why.
8. Then sweep the components that still use `dark:` / raw palette classes.

### Tier 2 — visual discipline (days, per-screen review)
9. One accent rule (§4.1) applied to the REPL header first — it is the worst offender and the most
   used surface.
10. Remove redundant dividers (§4.2).
11. Raise hit targets (§4.3).
12. Shared motion token (§4.4).
13. Four-state audit per panel (§4.5).

### Tier 3 — bundle (measure first)
14. Lazy-load Monaco; consolidate the duplicate libraries; record before/after with the visualizer.

### Tier 4 — carried over from July
15. Provider flattening, data tables, streaming — unchanged from the July roadmap, still valid.

---

## 8. Explicit non-goals

Stated so this document cannot be read as a mandate to add:

- **No new features.** Not one item above adds a capability.
- **No redesign of the layout.** The user's verdict on the panels — *"the dialogs and the swapping
  vertically and horizontally look already nice"* — is accepted. Tier 2 is tuning, not restructuring.
- **No third theme.** The direction is two.
- **No new dependency.** Every Tier 0–2 item is subtraction or re-tuning.

---

## 9. Editor-specific findings (separate track)

Raised in the same session; recorded here so they are not lost.

| Finding | Status |
|---|---|
| Switching scripts discarded unsaved work — **Open and Recent bypassed the guard the New button had** | **FIXED** — `ReplModeContent.tsx` now routes New / Open / Recent through one `guardUnsaved`. `npx tsc -b` exit 0. |
| No C# formatting | **Open.** No formatting provider exists anywhere (`grep` for `DocumentFormattingEditProvider` → 0 hits), and `monacoSetup.ts` documents that C# in Monaco is tokenizer-only. A real formatter is a **full vertical slice** (proto → engine Roslyn `Formatter.FormatAsync` → add-in → server → Monaco provider) — the same shape as the completion/hover work. A cheap partial alternative is a client-side **indent-only** provider (~60 lines, no RPC), which fixes pasted mis-indented code but is not a formatter. |

⚠ The formatter is the one item in this document that is genuinely *additive* work. It is listed
because it was raised, not because it fits the subtraction brief.

# Paracore UI — Research & Modernization Roadmap

> **Date:** 2026-07-30  
> **Scope:** `rap-web` — the Tauri desktop application  
> **Goal:** Take the UI to the next level in visual polish, usability, and architecture scalability

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Modern UI Landscape (2025–2026)](#2-modern-ui-landscape-20252026)
3. [Visual & Interaction Upgrades](#3-visual--interaction-upgrades)
4. [Functional & Usability Upgrades](#4-functional--usability-upgrades)
5. [Scalability & Architecture](#5-scalability--architecture)
6. [Technology Recommendations](#6-technology-recommendations)
7. [Prioritized Implementation Roadmap](#7-prioritized-implementation-roadmap)

---

## 1. Current State Assessment

### Technology Stack

| Layer | Current | Assessment |
|---|---|---|
| **Desktop Shell** | Tauri v1 | Functional but v2 is stable with better WebView2, mobile support, smaller bundles |
| **UI Framework** | React 19 + TypeScript 5.8 | Modern, well-chosen |
| **Build Tool** | Vite 7 | Latest major version |
| **CSS** | Tailwind CSS v4 + CSS Modules | Modern, Oxide engine |
| **Icons** | Font Awesome 7 + Heroicons | Good coverage, but dual libraries add bundle weight |
| **Component Libraries** | PrimeReact 10 (barely used), HeadlessUI 2.2 (underutilized) | Two libraries, little ROI |
| **Charts** | Recharts 3.6 | Solid choice |
| **Animation** | CSS transitions only | No spring physics, no exit animations |
| **State Management** | React Context API (8+ nested providers) | "Provider Hell" — identified in REFACTOR_PLAN.md |
| **HTTP Client** | Axios | Standard |
| **Auth** | Google OAuth + offline JWT | Works for current use case |
| **Typography** | Inter (Google Fonts) | Modern, good choice |

### What's Already Good

- **Three-theme system** (Light / Midnight / Eclipse Pro) with CSS custom properties — genuinely sophisticated
- **Resizable panels** with persisted widths via localStorage
- **Focus/Hero mode** on script cards with origin-based animation
- **Three-panel layout** (Sidebar → Content → Inspector) with swappable panels
- **Feature-based architecture** partially implemented (`src/features/auth`, `src/features/automation`, `src/features/settings`)
- **Glassmorphism overlays** (welcome gate, shutdown gate, sentinel dropdown)
- **Floating sentinel control** — draggable, detachable to separate window
- **Custom tooltip system** via `data-tooltip` attributes
- **REPL mode** for interactive C# scripting
- **Playlist system** for orchestrated script execution

### What Needs Work

- No command palette (largest missing power-user feature)
- No keyboard shortcut system
- Provider Hell — 8+ nested contexts
- `dark:` prefix used extensively in JSX (clutter, maintenance burden)
- No spring-physics animations (Motion/Framer Motion)
- Data tables are basic — no virtual scrolling, sorting, or export
- Empty states are plain text, no illustrations or CTAs
- Two unused UI libraries (PrimeReact, HeadlessUI) adding bundle weight
- No accessibility testing infrastructure
- No code splitting / lazy loading

---

## 2. Modern UI Landscape (2025–2026)

### 2.1 Design Direction: "Minimal Chrome, Maximum Data"

The dominant aesthetic for B2B/developer tools has shifted decisively toward **quiet density** — hierarchy conveyed through typographic weight and spacing rather than borders, shadows, or decorative color.

**Key principles:**
- **Dark-first design** — Linear, Supabase, Vercel design dark as primary; light is the variant
- **Color = meaning only** — reserved for state (error, success, warning) and semantic signals
- **Tables reclaim primacy** — Stripe-style dense data tables over chart-heavy dashboards
- **Flash-free theme switching** — inline `<head>` script before first paint to prevent FOWT

### 2.2 AI-Native Interfaces

The biggest paradigm shift: moving from "AI bolted on" to **AI-native**:
- AI output is a **first-class surface**, not a chat widget floating over old UI
- **Generative UI** — the model composes approved primitives into dynamic interfaces
- Streaming responses with progressive rendering
- AI summaries on top of inspectable data (never AI *instead of* data)

### 2.3 Reference Products

| Product | Why It Matters |
|---|---|
| **Linear** | Dark-first, keyboard-first density, command palette excellence |
| **Stripe** | Data tables as primary interface, minimal chrome |
| **Vercel** | Monochrome minimalism, color as meaning only |
| **Supabase** | Developer-tool UX patterns, dark mode execution |
| **PostHog** | Dense analytics with personality |
| **Attio** | AI-native CRM, generative UI patterns |

### 2.4 Component Library Landscape — The Headless Revolution

The **copy-paste ownership model** has won. **shadcn/ui** (~114K GitHub stars, ~3.87M weekly npm downloads) is now the default for new React + Tailwind projects. Components are scaffolded into your repo as source code — zero vendor lock-in.

**The Radix → Base UI transition:**
- Radix UI was acquired by WorkOS; update velocity has slowed
- The original team now maintains **Base UI** (MUI team), which reached v1.0 stable in 2026
- shadcn/ui added Base UI as a supported primitive layer

**Key library:** Ark UI (Chakra team, built on Zag.js state machines) — ships React, Vue, and Solid from the same state machines. Park UI is "shadcn/ui for Ark."

### 2.5 Tailwind CSS v4 — What's New

- **Oxide Engine** (Rust) — builds 3.5–5x faster, incremental builds 100x+ faster (microseconds)
- **CSS-first configuration** — `@theme` block replaces `tailwind.config.js`
- **Single import** — `@import "tailwindcss"` replaces three `@tailwind` directives
- **Native OKLCH color palette** with P3 wide gamut
- **Native `@container` queries** — no plugin needed
- **`starting:` variant** for `@starting-style` animations

### 2.6 Animation Best Practices

**Motion** (formerly Framer Motion, 18M+ weekly npm downloads) remains dominant:
- Spring physics over duration-based transitions (feel natural, are interruptible)
- `AnimatePresence` for exit animations
- Only animate `transform` and `opacity` (GPU-composited)
- Sweet spot: 200–400ms
- Always respect `prefers-reduced-motion`

**View Transitions API** — now Baseline 2026 — for page-level navigation transitions.

### 2.7 CSS — What's Baseline 2026

- Container Queries (`@container`)
- `@starting-style` for entry animations
- `:has()` selector
- `color-mix()` and OKLCH color space
- Scroll-driven animations
- Subgrid
- `light-dark()` CSS function

---

## 3. Visual & Interaction Upgrades

### 3.1 Component Primitives → shadcn/ui + Base UI

**Problem:** Custom-built components (Modal, Tooltip, Button, DropdownMenu) reinvent accessibility, keyboard handling, and focus management.

**Solution:** Adopt **shadcn/ui** (copy-paste into `src/components/ui/`). Replace PrimeReact and HeadlessUI entirely.

**Benefits:**
- Battle-tested accessibility from Base UI state machines
- Keyboard navigation that works out of the box
- Focus trapping in modals/dialogs
- Consistent API across all components
- AI code generation compatibility (Cursor, Copilot, Claude generate correct shadcn/ui)
- Components you own and modify

**Components to replace:**
| Current | shadcn/ui Replacement |
|---|---|
| Custom `Modal` | `Dialog` |
| Custom `Tooltip` | `Tooltip` |
| Inline buttons | `Button` (with variants) |
| Help dropdown | `DropdownMenu` |
| Custom segmented control | `ToggleGroup` |
| Settings inputs | `Input`, `Switch`, `Select`, `Slider` |
| Confirm dialogs | `AlertDialog` |
| Toast notifications (react-toastify) | `Sonner` (included in shadcn/ui) |

**Remove from package.json:**
- `primereact` (~500KB+)
- `@headlessui/react`
- Potentially `@heroicons/react` (shadcn/ui uses Lucide; or keep both during migration)
- `react-toastify` (replaced by Sonner)

### 3.2 Physics-Based Animation → Motion

**Current:** CSS transitions only (`transition-all duration-300`).

**Solution:** Add **Motion** and apply surgically:

| Where | What |
|---|---|
| Script cards | Staggered mount with `staggerChildren: 0.05` |
| Modals/overlays | `AnimatePresence` for exit transitions |
| Sidebar toggle | Spring-based slide (`stiffness: 300, damping: 30`) |
| FAB button | `whileHover={{ scale: 1.05 }}`, `whileTap={{ scale: 0.95 }}` |
| Notification toasts | Spring enter/exit (Sonner handles this natively) |
| Inspector panel | `AnimatePresence` when switching scripts |
| Focus/Hero mode | Origin-based spring animation (enhance existing CSS) |
| Dropdown menus | Scale + fade with spring physics |

**Rules:**
- Keep it subtle — 200–400ms
- Only `transform` and `opacity`
- Respect `prefers-reduced-motion` via `useReducedMotion()`
- Centralize animation presets in a shared config file

### 3.3 Command Palette (Cmd+K) — Critical Missing Feature

**This is the single highest-impact feature Paracore lacks.** Every modern developer tool has one.

**Implementation:** Use `cmdk` (the standard — used by shadcn/ui's `<Command>` component, by Linear, Vercel, Supabase).

**What it should do:**

| Category | Commands |
|---|---|
| **Navigation** | Go to Gallery, Go to REPL, Go to Playlists, Open Settings |
| **Scripts** | Fuzzy-search all scripts by name, category, author, description |
| **Actions** | Run Script, Edit Script, View Code, Open in VS Code, Add to Favorites |
| **Playlists** | Create Playlist, Run Playlist, Add Script to Playlist |
| **Settings** | Change Theme → Light / Midnight / Eclipse Pro, Toggle Layout Swap |
| **Recent** | Last 5 opened scripts, last 3 executed scripts |

**UX details:**
- `Cmd+K` to open, `Esc` to close
- Typing immediately fuzzy-searches
- Keyboard shortcut hints in result rows (right-aligned)
- Recent/frequent items shown by default (empty query)
- Sub-items for nested actions (e.g., "Change Theme" → list of three themes)

### 3.4 Centralized Keyboard Shortcuts

**Solution:** `useKeyboardShortcuts` hook with a registry pattern. Display shortcuts via a `<Kbd>` component.

**Proposed shortcuts:**

| Shortcut | Action |
|---|---|
| `Cmd+K` | Command palette |
| `Cmd+B` | Toggle sidebar |
| `Cmd+J` | Toggle inspector/output panel |
| `Cmd+Enter` | Run selected script |
| `Cmd+Shift+F` | Focus search bar |
| `Cmd+Shift+L` | Toggle layout swap |
| `Cmd+Shift+T` | Cycle theme |
| `Cmd+,` | Open Settings |
| `Escape` | Close modals, deselect script, close sidebar (mobile) |
| `Cmd+1/2/3` | Switch to Gallery / REPL / Playlists |

**Implementation:** Central `SHORTCUTS` config object keyed by action ID. `<Kbd>` component renders platform-aware keys (⌘ on Mac, Ctrl on Windows).

### 3.5 Typography & Visual Hierarchy Refinement

**Current state:** Inter font loaded. Heavy use of `text-[11px] font-bold uppercase tracking-[0.25em]` for micro-labels.

**Issues:**
- No defined type scale — ad-hoc text sizes (`text-[9px]`, `text-[10px]`, `text-[11px]`, `text-[13px]`)
- Some labels too small for readability
- Body text inconsistently sized

**Solution:**

Define a **type scale** as Tailwind-compatible tokens:

| Token | Size | Usage |
|---|---|---|
| `text-caption` | 11px / 0.688rem | Micro-labels, badges, kbd hints |
| `text-body-sm` | 13px / 0.8125rem | Secondary info, metadata, sidebar items |
| `text-body` | 14px / 0.875rem | Primary body text, descriptions |
| `text-body-lg` | 16px / 1rem | Card titles, section headers |
| `text-heading-sm` | 18px / 1.125rem | Panel headers |
| `text-heading` | 24px / 1.5rem | Modal titles, page headers |

- Replace raw `text-[11px]` with `text-caption`
- Increase minimum size to 11px (current `text-[9px]` is below accessibility recommendations)
- Use `tracking-tight` for headings (modern, tight letter-spacing)

### 3.6 Dark Mode — Semantic Token Refactoring

**Current state:** `themes.css` has solid semantic tokens, but components still use `dark:` prefix extensively in JSX:

```tsx
// Current — dark: clutter everywhere
className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-gray-700"
```

**Goal:** Eliminate `dark:` prefix from component JSX by routing through semantic tokens:

```tsx
// Target — clean, theme-agnostic
className="semantic-bg-panel semantic-text border-semantic"
```

**Solution:** Formalize into proper three-layer token architecture:

| Layer | Naming | Example |
|---|---|---|
| **Primitives** (raw values) | `--color-slate-900`, `--space-4` | Only in `tokens.css` |
| **Semantics** (intent-based) | `--surface-ground`, `--text-primary`, `--border-default` | Used in component classes |
| **Components** (specific) | `--card-hover-shadow`, `--button-primary-bg` | Used in CSS modules |

**Already have:** `--bg-ground`, `--bg-panel`, `--bg-card`, `--bg-card-focus`, `--text-main`, `--text-muted`, `--border-main`, `--accent`

**Need to add:**
- `--surface-elevated` (for cards on cards, dialogs — currently same as `--bg-card`)
- `--border-subtle` (for dividers within a surface)
- `--text-tertiary` (for the smallest, most recessive labels)
- `--shadow-card`, `--shadow-modal` (theme-aware shadow values)
- `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl` (consistent border radius)
- `--state-success`, `--state-warning`, `--state-error`, `--state-info`

**Migration path:**
1. Add new semantic tokens to `themes.css`
2. Create utility classes (`.surface-ground`, `.text-primary`, etc.) or register them in Tailwind's `@theme`
3. Gradually replace `dark:` patterns in components
4. One component at a time — `bg-white dark:bg-slate-900` → `bg-[var(--bg-panel)]`

---

## 4. Functional & Usability Upgrades

### 4.1 First-Class Data Tables

**Problem:** `TableTabContent` renders basic tables. No sorting, filtering, resizing, or export.

**Solution:** Build a proper data table using **@tanstack/react-table** + **@tanstack/react-virtual** (for large result sets).

**Features:**
- Virtual scrolling for 10K+ row results
- Column sorting (click header)
- Column filtering (per-column filter inputs)
- Column resizing (drag header borders)
- Column visibility toggles (hide/show columns)
- Sticky headers with scroll shadow indicator
- Row selection with "Copy selected" action
- Export to CSV
- Density modes: Compact (28px row) / Default (36px) / Comfortable (44px)
- Monospace font for numeric columns
- Right-align numeric columns

**Keep Recharts** for where a trend genuinely benefits from a visual shape (sparklines in table cells, bar charts for distribution summaries).

### 4.2 Real-Time Execution Streaming

**Problem:** Script execution is fire-and-wait. Results appear after completion. No streaming feedback.

**Solution:** Add **Server-Sent Events (SSE)** from the Python backend (`rap-server`). During script execution, the server streams log lines, and the UI renders them in real-time in the Output Panel.

**UX:**
- Execution log streams line-by-line in the History tab
- A spinner/pulse indicator shows "Running…" with elapsed time
- The log auto-scrolls (with a "pin to bottom" toggle)
- On completion: spinner resolves to ✓ or ✗, the Analytics tab badge pulses if structured output was generated
- On error: the error line highlights in red with a "Copy error" button

**Architecture:**
```
Script → Python backend → SSE stream → EventSource in browser → ExecutionHistory updates
```

SSE is the right choice (over WebSocket) because:
- Read-heavy, unidirectional (server → client)
- Built-in automatic reconnection via `EventSource` API
- Standard HTTP — no protocol upgrade, works through proxies
- Falls back to polling if SSE is unavailable

### 4.3 Enhanced Script Card Design

**Improvements:**

1. **Density toggle** — switch between card grid and compact list view
   - Card: current layout with description snippet
   - List: single row — icon, name, category badges, author, last-run status

2. **Quick preview on hover** — after 500ms hover, show a small code snippet popover (first 10 lines)

3. **Status indicators** on cards:
   - Green dot: last run succeeded
   - Red dot: last run failed
   - Gray dot: never run
   - Clock icon: running right now (animated)

4. **Last-run metadata** in card footer: "Ran 2h ago • 3.4s"

5. **Multi-select mode:**
   - `Cmd+Click` to toggle selection
   - `Shift+Click` to range-select
   - Batch actions bar appears: "Delete 3 scripts", "Add to Playlist", "Categorize as…"

6. **Drag to reorder** in playlists (using Motion's drag support)

7. **Sort options dropdown:** Name, Date Modified, Author, Run Count, Last Run

### 4.4 Smart Search

**Enhancements over current basic filter:**

1. **Fuzzy search** — match script name, description, author, categories, parameter names

2. **Search history** — dropdown shows recent searches (persisted in localStorage)

3. **Saved filter presets** — "My Wall Scripts", "Uncategorized", "Recently Failed"

4. **Filter chips** with count badges: `Walls (12)` `Floors (5)` `Doors (8)`

5. **Natural language search** (Phase 5): lightweight TF-IDF or embedding vectors over script metadata + code content. "Scripts that create walls and doors" → relevant results.

### 4.5 Navigation Enhancements

1. **Breadcrumbs** in the inspector header:
   ```
   Gallery > Walls > CreateWall.cs
   ```

2. **Sidebar improvements:**
   - Collapse animation (currently instant — should be spring-based slide)
   - Resizable sidebar width (drag right edge)
   - Section collapse/expand (Favorites, Recents, Categories)

3. **Recent items in command palette** — opened by default when palette is empty

4. **Tab persistence** — last active view (Gallery/REPL/Playlists) remembered across app restarts

### 4.6 Empty States & Loading States

**Current:** Plain text fallbacks: "No scripts found", "No script selected".

**Solution:** Illustrated empty states for every empty view:

| View | Empty State |
|---|---|
| Gallery (no scripts) | "No scripts yet" + illustration + "Add Script Source" CTA |
| Search (no results) | "No scripts match 'walls'" + "Try broadening your search" |
| Favorites (empty) | "Favorite scripts to pin them here" + star icon |
| Recents (empty) | "Run a script and it'll appear here" + play icon |
| Playlists (empty) | "Create your first playlist" + layers icon + "New Playlist" CTA |
| History (empty) | "Execute a script to see output" + terminal icon |
| Analytics (empty) | "Scripts with structured output appear here" + chart icon |

**Loading states:** Use **skeleton screens** (shadcn/ui's `<Skeleton>` component) for:
- Script gallery loading (grid of skeleton cards)
- Inspector loading (skeleton form fields)
- Sidebar loading (skeleton list items)

### 4.7 Output Panel Improvements

1. **Collapsible output sections** — group log lines by execution, collapsible with timestamp header
2. **Log level coloring** — errors in red, warnings in amber, info in blue, success in green
3. **Log filtering** — toggle: All / Errors Only / Warnings Only
4. **Timestamps** on each log line (toggleable)
5. **"Copy all" button** with visual feedback (checkmark animation on copy)
6. **Pipeline visualization** — when running a playlist, show a mini pipeline diagram (script A → script B → script C) with current position highlighted

---

## 5. Scalability & Architecture

### 5.1 State Management — Break Out of Provider Hell

**Current:** 8+ nested context providers in `AppProvider`. The `REFACTOR_PLAN.md` already identifies this.

**Solution: Zustand + TanStack Query**

**Zustand** for client state:
- UI state (sidebar open, active view, inspector open, etc.)
- Theme preference
- Local preferences (density, sort order, etc.)
- Watchdog/sentinel state

**TanStack Query** for server state:
- Script list (with automatic background refetching)
- Script details
- Execution results
- Revit status polling (replace manual `useEffect` + `setInterval`)
- Playlist data

**Benefits:**
- No provider nesting — stores are importable functions
- Automatic cache invalidation
- Optimistic updates for snappy UI
- Request deduplication (two components fetching same script → one request)
- Stale-while-revalidate pattern
- DevTools for debugging

**Migration path:**
1. Extract `useUI` state → Zustand store
2. Extract `useScripts` data fetching → TanStack Query
3. Extract `useScriptExecution` → Zustand (execution state) + TanStack Query (results)
4. Keep React Context only for: Theme (needs provider for CSS class toggle), Auth (needs provider for token management)

### 5.2 Tauri v2 Migration

**Benefits over v1:**
- Better WebView2 integration on Windows
- Mobile support (iOS/Android) — future-proofing
- Improved IPC with typed `invoke`/`emit` commands
- Smaller bundles
- Plugin-based permission system (more secure)
- Multi-webview support (simplifies detached sentinel window)
- Better dev experience (hot reload, better error messages)

**Effort:** Medium. API surface is similar but not identical. Migration guide available.

**Timing:** Phase 4, after the UI foundation is solid. Not a blocker for visual improvements.

### 5.3 Design Token System Formalization

**Move from flat CSS custom properties to structured three-layer tokens:**

**File structure:**
```
src/styles/
  tokens/
    primitives.css    — raw values (colors, spacing, radii, shadows)
    semantic.css      — semantic mappings (theme-aware)
    components.css    — component-specific tokens
    themes.css        — light/midnight/eclipse theme map
```

**OKLCH color space:** Tailwind v4 already uses OKLCH internally. Define brand tokens in OKLCH for perceptual uniformity. This enables:
- Systematic dark mode adjustments (reduce lightness, reduce chroma)
- `color-mix()` for hover/active states
- Future `contrast-color()` for guaranteed WCAG-compliant text on any surface

**Tailwind v4 `@theme` integration:**

```css
@theme {
  --color-surface-ground: var(--surface-ground);
  --color-surface-panel: var(--surface-panel);
  --color-text-primary: var(--text-primary);
  /* … all semantic tokens registered as Tailwind colors … */
}
```

Then components can use `bg-surface-panel` and `text-text-primary` directly — no `dark:` prefix needed.

### 5.4 Accessibility — Systematic Approach

**Four-layer testing strategy:**

| Layer | Tool | Catches |
|---|---|---|
| **Automated (CI)** | axe-core + @axe-core/playwright | ~30–40% of issues: color contrast, missing labels, heading hierarchy |
| **Component-level** | Inherited from shadcn/ui (Base UI) | Keyboard nav, focus trapping, ARIA roles |
| **Manual keyboard** | Tab/Shift+Tab through every view | Focus order, visible indicators, skip links |
| **Screen reader** | NVDA (Windows, free) | Critical flows: open script → set params → run → see results |

**Key fixes needed immediately:**
- Add `:focus-visible` styles throughout — currently `outline: none` may be lurking
- Add skip-to-content link (first focusable element)
- Focus trapping in modals (shadcn/ui's Dialog handles this)
- `aria-live` region for dynamic content (execution results, notifications)
- Color contrast audit in Eclipse Pro theme (dark grays on dark backgrounds)
- Ensure all icons have `aria-hidden="true"` and all icon-buttons have `aria-label`

### 5.5 Performance — Code Splitting & Lazy Loading

**Current:** Everything bundled together. `react-syntax-highlighter` (~200KB) loaded even if user never opens the code viewer.

**Solution:**

```tsx
const ScriptGallery = React.lazy(() => import('@/features/automation/components/ScriptGallery/ScriptGallery'));
const ReplModeContent = React.lazy(() => import('@/features/automation/components/ScriptInspector/ReplModeContent'));
const PlaylistsTab = React.lazy(() => import('@/features/automation/components/Playlists/PlaylistsTab'));
const FloatingCodeViewer = React.lazy(() => import('@/features/automation/components/ScriptInspector/FloatingCodeViewer'));
const SettingsModal = React.lazy(() => import('@/features/settings/components/SettingsModal'));
```

Wrap each in `<Suspense>` with a skeleton fallback.

**Additional optimizations:**
- Font Awesome → swap to tree-shakeable SVGs, or consolidate on Lucide (ships with shadcn/ui)
- Heroicons → remove after migration to shadcn/ui's Lucide icons
- `react-syntax-highlighter` → consider lighter alternatives (`shiki` with WASM, or `prism-react-renderer`)

### 5.6 Bundle Size Target

| Current (estimated) | Target |
|---|---|
| PrimeReact: ~500KB | Remove → **0KB** |
| HeadlessUI: ~50KB | Remove → **0KB** |
| Heroicons: ~100KB | Remove → **0KB** |
| Font Awesome: ~150KB | Tree-shake or consolidate |
| react-toastify: ~20KB | Replace with Sonner → **~3KB** |
| shadcn/ui (new): +~20KB | Copy-paste only used components |
| Motion (new): +~30KB | Tree-shaken |
| **Net bundle change** | **~600KB saved** |

---

## 6. Technology Recommendations

### Keep

| Technology | Why |
|---|---|
| React 19 | Latest, well-chosen |
| TypeScript 5.8 | Strict mode, excellent DX |
| Vite 7 | Fast, modern |
| Tailwind CSS v4 | Already on latest, Oxide engine |
| Recharts | Works, no reason to change |
| Axios | Standard, well-integrated |
| Inter font | Modern, readable |
| PostHog | Already integrated |
| react-markdown + remark-gfm | Works for agent responses |
| react-rnd | Works for resizable panels |
| Tauri | Core architecture — migration to v2, not replacement |

### Add

| Technology | Purpose |
|---|---|
| **shadcn/ui** | Component primitives (Button, Dialog, DropdownMenu, Tooltip, Input, Switch, Slider, etc.) |
| **Motion** (framer-motion) | Spring-physics animations, AnimatePresence |
| **cmdk** | Command palette |
| **Zustand** | Client state management |
| **TanStack Query** | Server state management |
| **@tanstack/react-table** | Data table with sorting, filtering |
| **@tanstack/react-virtual** | Virtual scrolling for large datasets |
| **Sonner** | Toast notifications (ships with shadcn/ui) |
| **axe-core** + **@axe-core/playwright** | Accessibility testing in CI |
| **Lucide** (via shadcn/ui) | Primary icon library |

### Remove

| Technology | Replaced By |
|---|---|
| PrimeReact | shadcn/ui |
| @headlessui/react | shadcn/ui (Base UI primitives) |
| @heroicons/react | Lucide (via shadcn/ui) |
| react-toastify | Sonner |
| @fortawesome/* | Gradual migration to Lucide, or keep tree-shaken subset |

---

## 7. Prioritized Implementation Roadmap

### Phase 1: Foundation (~2–3 weeks)
*Highest impact, lowest risk. Ships value immediately.*

- [ ] **Adopt shadcn/ui** — scaffold into `src/components/ui/`
- [ ] Replace Modal, Tooltip, Button with shadcn/ui equivalents
- [ ] Replace react-toastify with Sonner
- [ ] **Add Motion** — apply to card hover, modal enter/exit, sidebar toggle
- [ ] **Add cmdk command palette** — `Cmd+K` to open, fuzzy search, navigation + actions
- [ ] **Keyboard shortcut system** — `useKeyboardShortcuts` hook + `<Kbd>` component
- [ ] **Consolidate icons** — remove Heroicons, keep Font Awesome for now, adopt Lucide for new code

### Phase 2: Visual Polish (~2–3 weeks)

- [ ] **Formalize design tokens** — three-layer system in `src/styles/tokens/`
- [ ] **Eliminate `dark:` prefix** — route components through semantic tokens
- [ ] **Type scale** — consistent named sizes, increase minimum to 11px
- [ ] **Radius token** — consistent `--radius-sm/md/lg/xl` across all surfaces
- [ ] **Illustrated empty states** — every empty view gets a designed fallback
- [ ] **Skeleton loading states** — gallery, inspector, sidebar loading
- [ ] **Density toggle** — compact list view for script gallery

### Phase 3: Functional Depth (~3–4 weeks)

- [ ] **First-class data table** — @tanstack/react-table + virtual scrolling + export
- [ ] **Real-time execution streaming** — SSE from Python backend
- [ ] **Enhanced search** — fuzzy, history, saved filters
- [ ] **Script card enhancements** — status indicators, hover preview, multi-select
- [ ] **Drag-to-reorder** in playlists (Motion drag support)
- [ ] **Output Panel improvements** — collapsible sections, log filtering, timestamps

### Phase 4: Architecture (~3–4 weeks)

- [ ] **Zustand** — extract UI state, execution state from Context
- [ ] **TanStack Query** — extract server data fetching
- [ ] **Code splitting** — lazy-load features with Suspense + skeleton fallbacks
- [ ] **Accessibility pass** — axe-core in CI, keyboard audit, screen reader testing
- [ ] **Remove PrimeReact and HeadlessUI** from dependencies (if not already done)
- [ ] **Tauri v2 migration** prep — audit APIs, plan migration

### Phase 5: Advanced (~4–6 weeks)

- [ ] **Natural language script search** — lightweight embeddings or TF-IDF
- [ ] **Custom theme builder** — user-configurable token values in Settings
- [ ] **Plugin/extension system** — third-party script packs
- [ ] **Collaboration features** — shared workspaces, team script libraries (pro feature)
- [ ] **Mobile companion app** — leverage Tauri v2 mobile support for script status monitoring

---

## Appendix A: Quick Wins (Can Do Today)

These changes require minimal code and deliver immediate visual impact:

1. **Increase minimum font size** — `text-[9px]` → `text-[11px]` in About modal and micro-labels
2. **Add `:focus-visible` ring** — consistent blue ring on all interactive elements
3. **Consistent border radius** — audit for mixed `rounded-xl`/`rounded-2xl`/`rounded-[2rem]`, standardize
4. **Smooth scroll** — add `scroll-behavior: smooth` to `html`
5. **Selection color** — `::selection { background: var(--accent); color: white; }`
6. **Cursor pointer on cards** — some script cards may lack `cursor-pointer`
7. **Hover states on icon buttons** — all icon buttons should have a visible hover state (some already do, audit for consistency)

## Appendix B: Component Migration Map

| Current Component | Current Location | shadcn/ui Target |
|---|---|---|
| `Modal` | `src/components/common/Modal.tsx` | `Dialog` |
| `ConfirmActionModal` | `src/features/automation/components/ScriptInspector/ConfirmActionModal.tsx` | `AlertDialog` |
| `InfoModal` | `src/features/automation/components/ScriptInspector/InfoModal.tsx` | `Dialog` |
| `Tooltip` | `src/components/common/Tooltip.tsx` | `Tooltip` |
| `NotificationDisplay` | `src/components/common/NotificationDisplay.tsx` | `Sonner` (toaster) |
| Inline buttons | Throughout | `Button` (with `variant` prop) |
| Settings toggles | `src/features/settings/` | `Switch` |
| Theme toggle | TopBar | `ToggleGroup` or `DropdownMenu` |
| Help dropdown | TopBar | `DropdownMenu` |
| User menu | TopBar | `DropdownMenu` |
| Filter pills | Gallery | `Badge` + `Toggle` |
| Script parameters form | `ScriptParametersForm.tsx` | `Input`, `Select`, `Slider`, `Switch` |
| Segmented control | `SegmentedControl.tsx` | `ToggleGroup` |

## Appendix C: Token Migration Example

**Before (current pattern):**
```css
/* themes.css */
:root { --bg-ground: #f8fafc; --text-main: #0f172a; }
.dark:not(.eclipse) { --bg-ground: #0f172a; --text-main: #f8fafc; }
```

```tsx
// Component — dark: everywhere
<div className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
```

**After (target pattern):**
```css
/* tokens/semantic.css */
:root {
  --surface-ground: #f8fafc;
  --text-primary: #0f172a;
}
[data-theme="dark"] {
  --surface-ground: #0f172a;
  --text-primary: #f8fafc;
}

/* Tailwind @theme registration */
@theme {
  --color-surface-ground: var(--surface-ground);
  --color-text-primary: var(--text-primary);
}
```

```tsx
// Component — clean, no dark:
<div className="bg-surface-ground text-text-primary">
```

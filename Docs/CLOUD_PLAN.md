# Paracore Cloud Plan

**Status:** ⏸ **PAUSED 2026-10-12** — feasibility **PROVEN**, cloud coding **STOPPED BY CHOICE**.
The active workstream is now **TikTok / outreach**. → **§12 = resume point.**
**Scope:** move from a local-only Revit add-in to selling **isolated, scope-specific takeoff
services and digital products from the cloud** — without becoming an Autodesk.

---

## 0. Verdict

You are **not starting from zero — you are already partly in the cloud.** Two facts settle this:

1. **Your auth server is live in production.** `rap-server/server/config.py:11` points at
   `https://rap-auth-server-production.up.railway.app`, and that endpoint **returned a valid RSA
   public key** when fetched on 2026-10-12. You have a running, deployed, multi-tenant identity
   service on Railway today.
2. **The seam that makes cloud possible already exists.** `protos/corescript.proto` defines
   `AddinBridge` — *"Internal service for the Revit Add-in to talk to the Sidecar"* — with
   `Subscribe(...) returns (stream TaskEnvelope)`. The add-in **dials out** and pulls work.
   That is a reverse tunnel: no inbound port, firewall-friendly, and exactly the shape a cloud
   control plane needs.

So the plan is not "build a cloud platform." It is **move the boundary outward, one layer at a
time, proving each layer before the next.**

---

## 1. What already exists (verified, not assumed)

| Piece | What it is | State | Evidence |
|---|---|---|---|
| `rap-auth-server` | Identity: Google sign-in, JWT (RS256), **teams / memberships / roles**, invitation tokens, email allowlist | **LIVE on Railway** | `config.py:11`; live key fetch |
| `rap-server` | Python FastAPI **control plane**: routers for auth, runs, script execution & management, sync, presets, query, playlists, user settings, tool builder; DB + migrations | Runs **locally** (SQLite), but **Postgres-ready** via `DATABASE_URL` | `server/main.py`; `config.py:51` |
| `Paracore.Server` | The **Sidecar** (C# gRPC host): `AddinBridgeService` + `CoreScriptProxyService` | Local only — `ListenLocalhost(50051)` | `Program.cs:68` |
| `Paracore.Addin` | The Revit add-in; runs CoreScript **against the live model** | Local only — dials `http://localhost:50051` | `CoreScriptClient.cs:62` |
| `CoreScript.Engine` | The takeoff/script engine | ⚠ **Revit-bound** — 46 files reference the Revit API | grep `Autodesk.Revit` |
| `rap-web` | Frontend: **React + Vite + Tauri**, with a **Dockerfile** | Can ship as desktop **or** web | `src-tauri/`, `Dockerfile` |
| `paracore-gen` | Shared AI brain: agent, MCP core, gRPC client | Imported by `rap-server` | `main.py:18-29` |

**⚠ The one hard constraint:** the engine needs the Revit API, so **execution must stay where Revit
is**. You cannot move the engine to the cloud. You move everything *around* it.

**✅ That blocker is now CLEARED (2026-10-12).** `localhost:50051` *was* hardcoded in three places.
Two are now configurable, and **verified present in the installed binaries**:
- `Paracore.Addin` → **`PARACORE_SIDECAR_URL`** (default `localhost:50051`; a remote value also stops the
  add-in launching a local sidecar)
- `Paracore.Server` (sidecar) → **`PARACORE_SIDECAR_BIND`** (default `localhost:50051`)
- `corescript-vscode/src/grpcClient.ts:19` — **deliberately left hardcoded.** The VS Code extension is
  free, consumes only the generic engine, and is out of scope. ⚠ Do not "fix" it.

⚠ **The MCP half of the seam already existed — do not re-add it.** `paracore-gen/grpc_client.py:38,60`
and `paracore-takeoff/grpc_client.py:38,60` already read **`GRPC_SERVER_ADDRESS`** (default
`localhost:50051`). So the full chain is redirectable **today**:
**MCP = `GRPC_SERVER_ADDRESS`** · **add-in = `PARACORE_SIDECAR_URL`** · **sidecar bind = `PARACORE_SIDECAR_BIND`**.

---

## 2. What we will NOT build (say it out loud, so we never drift)

The fastest way to fail is to aim at Autodesk. **Explicitly out of scope, forever:**

- ❌ **A model hub / CDE** — hosting, versioning and browsing models is Autodesk ACC / BIM 360 and
  **Speckle**'s job. We *use* it; we don't build it.
- ❌ **Cloud Revit automation at scale** — Autodesk already sells this (APS Design Automation runs
  Revit/AutoCAD as cloud services). We are not competing with that.
- ❌ **Project management / field ops / RFIs / submittals** — that's Procore.
- ❌ **A general estimating platform for firms** — Procore/ACC/Realx territory.
- ❌ **A geometry kernel** — decades of work; a losing game.
- ❌ **3D model viewers / design review** — Speckle, IFC.js do this well.
- ❌ **Rebuilding auth** — it exists and it's live.
- ❌ **Enterprise multi-firm collaboration suites** — SSO, procurement, SLAs, portfolios.

**The rule:** *we do one specific piece of work, for one scope, and we deliver it.* Nothing broader.

---

## 3. The architecture — five layers, clean seams

```
   ┌─────────────────────────────────────────────────────────────┐
   │  5. CLIENT SURFACE   web portal · email/WhatsApp delivery    │  ← the shopfront
   ├─────────────────────────────────────────────────────────────┤
   │  4. AI LAYER         agent drafts takeoff + narrative        │  ← paracore-gen (exists)
   ├─────────────────────────────────────────────────────────────┤
   │  3. CONTROL PLANE    identity · jobs · rate books · results  │  ← rap-server (exists, local)
   ├─────────────────────────────────────────────────────────────┤
   │  2. WIRE CONTRACT    a versioned, Revit-free job envelope    │  ← the seam (proto exists)
   ├─────────────────────────────────────────────────────────────┤
   │  1. EXECUTION        Revit + add-in worker (LOCAL)           │  ← stays on the machine
   └─────────────────────────────────────────────────────────────┘
```

- **Layer 1 (Execution)** — always local. Revit + the add-in, dialling **outward** as a worker.
- **Layer 2 (Wire contract)** — the `TaskEnvelope` seam. Must be **versioned, minimal, Revit-free**.
  This single decision is what keeps cloud, private-cloud and on-prem all possible from one codebase.
- **Layer 3 (Control plane)** — `rap-server`, lifted to the cloud. Identity, job queue, rate books,
  results, history. **No model geometry lives here.**
- **Layer 4 (AI)** — the agent that runs the takeoff and drafts the deliverable. Already exists as
  `paracore-gen`; it becomes the "AI-first" differentiator.
- **Layer 5 (Client surface)** — the portal where a client submits a model and receives a BOQ.

**Modularity rule:** a new scope (ParasAluminum, ParasPlaster, …) is a **new Layer-4 method + rate
book + template** — it reuses Layers 1–3 and 5 unchanged. That is how we scale scopes without
scaling the team.

---

## 4. Product vs service — how a "Paras scope" is sold

A **Paras scope** is a packaged asset:

> **ParasPlaster = { method spec } + { rate book } + { deliverable template }**

The *same* scope is delivered **two ways**, through the *same* engine and the *same* job pipeline:

| | **Service** (do-it-for-you) | **Digital product** (self-serve) |
|---|---|---|
| Who runs it | **You** (or your worker) | The client / their QS |
| Input | Client sends the model | Client uploads the model |
| Output | You deliver the BOQ | They get the BOQ instantly |
| Price | **High** (per project) | **Lower** (per run / subscription) |
| Needs | Almost nothing new | UI, trust, self-serve |
| Speed to first revenue | **Days** | Weeks–months |

**Decision: service first, productise per scope second.** Sell the *service* (Paras Plastering takeoff
as a done-for-you job) before building any self-serve UI. The service pays for the platform; the
product is the same scope with the human removed. **Do not build the self-serve product before a
scope has paying service demand** — that is the classic one-person trap.

Every scope is **both** — but only ever sequenced service → product.

---

## 5. The stack — what to host on, what to test with

You already run **Railway**, so stay there. Don't add a second platform's learning curve for no reason.

| Need | Recommendation | Why / cost |
|---|---|---|
| Control plane (`rap-server`) | **Railway** | You already use it; auth server is there |
| Identity (`rap-auth-server`) | **Railway** | **Already live** |
| Database | **Railway Postgres** (or **Neon** free) | `rap-server` is Postgres-ready via `DATABASE_URL` |
| Object storage (models, BOQs) | **Cloudflare R2** or **Backblaze B2** | Cheap/free tier; S3-compatible |
| Remote test networking | **Tailscale** (free) | ⭐ Solves your "no second computer" problem — see §6 |
| Temporary public tunnel | **Cloudflare Tunnel** / ngrok | Expose a local service for a test, no DNS |
| Frontend | **Cloudflare Pages** or the `rap-web` Dockerfile | The Tauri app already builds for web |

**Reality on "free":** Railway's free plan is now a **30-day trial ($5 credit), then ~$1/month**
capped at 1 project / 3 services; realistic running cost is **~$5–10/month** (Hobby). **Fly.io no
longer has a free tier.** Render's free tier **sleeps on idle**, which breaks always-on gRPC — avoid
it for the worker link. Budget a few dollars; it is not the constraint.

**Alternative all-in-one:** **Supabase** (Postgres + storage + auth + edge functions). Only worth it
if you'd rather consolidate — you already have auth, so it's optional.

---

## 6. Testing protocol — layer by layer, with a second machine

You have one machine; your friend has another. That is enough. **Tailscale** puts both on one private
network with zero firewall configuration — this is the key tool for remote testing.

| Layer | Setup | Passes when |
|---|---|---|
| **L0 — loopback** | Everything on your PC | Already works today |
| **L1 — same machine, two roles** | Sidecar + add-in as separate processes | A job round-trips |
| **L2 — remote over LAN/Tailscale** | Sidecar on PC-A, add-in on PC-B | A takeoff runs from B against A |
| **L3 — cloud** | Sidecar on Railway, add-in on your PC | A job submitted in the cloud executes locally |
| **L4 — second tenant** | Friend signs in with their own account | They see *their* data only — isolation holds |

**Rule:** a layer is "robust" only when it passes its check **three times in a row**, including once
after a restart. Only then does the next layer start. (This is the same discipline as the engine
gates — a layer that silently half-works is worse than one that fails.)

---

## 7. The phased plan

### Phase 0 — Make the seam configurable *(no cloud yet)* — ✅ **BUILT, INSTALLED, VERIFIED 2026-10-12**
- ✅ `PARACORE_SIDECAR_URL` (add-in) and `PARACORE_SIDECAR_BIND` (sidecar). Default is
  `localhost:50051`, so **existing installs are unchanged**; a remote URL also stops the add-in
  launching a local sidecar.
- ✅ **Built + installed** → `C://ProgramData//Autodesk//Revit//Addins//2025//Paracore//` (2026-10-12 18:40).
- ✅ **The seam is provably in the shipped binary.** Scanned `Paracore.Addin.dll` / `Paracore.Server.dll`
  for **UTF-16LE** literals and found `PARACORE_SIDECAR_URL`, `PARACORE_SIDECAR_BIND`, `localhost:50051`.
  ⚠ **.NET string literals are WIDE** — a plain ASCII grep on a DLL finds nothing and would falsely
  "prove" the edit missing.
- ✅ **Round trip works after the rebuild:** `paracore-gen/ping`, `paracore-takeoff/ping` and
  `get_context` all answered from Revit 2025 (project *B+G+2 - KedirMohammed*; view `{3D}`; 9 levels).
- ⏳ **THE ONLY UNPROVEN THING:** that setting the variables actually **redirects** a connection.
  Compiling a seam is not exercising it. Needs a Revit **restart** with the vars set (an already-running
  Revit cannot have its environment changed from outside) — i.e. the **L2 two-machine Tailscale test**.
  **No code change is required to run it.**
- Remaining: TLS (self-signed is fine for testing).
- **Done when:** a takeoff runs end-to-end across two machines, three times, including after restart.
- ⚠ Known friction (cosmetic, not worth a rebuild): the two halves use **different env-var names** for
  one concept, and `mcp_core/tools.py:474,495,503` hardcode *"localhost:50051"* in the **diagnostic
  text** — in a remote test the failure message names the wrong address.

### Phase 1 — Lift the control plane to the cloud *(no geometry moves)*
- Deploy `rap-server` to Railway behind TLS. Point it at Railway/Neon Postgres. Wire object storage.
- Auth already federates to the live auth server — verify login works from the cloud deployment.
- **Test:** your friend logs in to the **cloud** control plane from their own machine.
- **Done when:** the friend has their own account and sees only their own projects (multi-tenant isolation).

### Phase 2 — The add-in becomes a registered worker
- The add-in authenticates to the cloud and **dials out** (the `AddinBridge.Subscribe` stream already
  does this). The cloud queues jobs; the worker pulls, executes, returns results.
- **Test:** submit a job from the cloud UI; your machine executes it; the result appears in the cloud.
- **Done when:** a job submitted by your **friend's** account is executed on your machine and delivered back.

### Phase 3 — First scope as a *service* (Paras Plastering), end to end
- Package the scope: method spec + rate book + deliverable template. Job pipeline + delivery
  (PDF/XLSX + email/portal link).
- **Test:** friend submits a real model; a real BOQ is delivered.
- **Done when:** a **billable** deliverable has been produced for a **real client** through the cloud.

### Phase 4 — The Revit-free product (IFC path)
- Use **IfcOpenShell** (mature Python library) to extract quantities from **IFC** — no Revit, no install.
- Run the **same method logic**; deliver a BOQ in the browser. Start with the **pure-data sections**
  (finishing, painting, linear) — those need no geometry kernel.
- **Test:** upload an IFC in the browser → BOQ out.
- **Done when:** a client can self-serve **without installing anything**.

### Phase 5 — AI-first + more scopes + client communication
- The agent drafts the takeoff and the BOQ narrative (`paracore-gen`). Add scopes (ParasAluminum, …).
- Client portal: submission, status, delivery, notifications.
- **Each new scope is a Layer-4 asset — it adds a SKU, not a system.**

---

## 8. Profitability & client communication

**Where the money is (ranked):**
1. **Services first** — done-for-you takeoffs are high-margin, need no self-serve UI, and start now.
2. **Scope SKUs** — each new Paras scope is near-zero marginal cost to add (reuses the pipeline).
3. **Rate books** — the durable asset. Whoever owns trustworthy regional cost data owns the pricing.
4. **Productised self-serve** — scales, but only after the service proves demand.

**Communication (keep it boring and reliable):**
- One channel for intake (a form / email), one for delivery (a portal link + a PDF).
- Every BOQ carries **provenance** — where each number came from. In a world of cheap AI output,
  *provable* is the premium. This is the differentiator, not the software.
- Status updates without being asked: received → in progress → delivered.

---

## 9. Pro-code protection — settled: we do NOT protect the code

**⚠ REVERSED 2026-10-12 (the user's call).** The earlier "cloud-delivered, in-memory pack" decision is
**withdrawn**.

**Why.** An assembly that loads on the customer's machine *is on the customer's machine*. Delivering it
from the cloud changes **where it was stored**, not **whether it is exposed** — and the load must happen
in-process, inside Revit, either way. Cloud delivery bought **complexity, not safety**.

**⚠ The constraint that still shapes everything.** The takeoff extension methods
(`paracore-takeoff/pack/Engine/Globals/TakeOff/*`) call the **Revit API**, and the Book renders pictures
of the model. Both must run **inside Revit, on the customer's machine**. Pro code **cannot execute in the
cloud** — we should never promise otherwise.

**What the entitlement gate therefore is.** A **licence gate, not a lock.** It enforces *who may run* the
pro features against honest customers and makes the entitlement real. It does **not** stop a determined
copier. That is how most commercial software works; pretending otherwise wastes effort.

**So: give the code, and sell what cannot be copied.** In priority order:
1. **The service** — you run the takeoff and deliver the BOQ. Needs no code protection at all. Primary revenue.
2. **The rate book** — data, not code. Served from the cloud, entitlement-gated, never shipped.
3. **The deliverable, the updates, and the trust** — a copied DLL goes stale; provenance cannot be copied.

**Optional strengthening (for the self-serve product).** Make the cloud a **dependency for value**, not a
**check for permission**: if a priced BOQ requires the cloud's rate book, then patching out the check
yields quantities with no prices — which is not the product. **A dependency cannot be patched away; a
check can.**

**Plan impact — it gets simpler:**
- ❌ No pack delivery, no in-memory load, no collectible load context, **no engine change**.
- ✅ The gate sits on the **execution path that already exists**: `rap-server` already injects
  `__license_tier__` into every execution — extend the binary `free` / `enterprise` to **per-scope
  entitlements** (`paras.aluminum`, …).
- ✅ **Phase 2.5 is deleted.** Phases 1–5 stand.

---

## 10. What stays in the cloud — the execution gate

**The principle: a *check* can be patched out; a *dependency* cannot.** So the cloud should hold something
the **deliverable needs**, not merely something the tool *asks permission* from.

**Tier 1 — monitoring and control (build first; cheap).** A per-run authorisation. The add-in asks
`rap-auth` to authorise an execution for (user, project, scope), receives a short-lived token and a
**run id**, and the export refuses to produce a deliverable without it; the run is recorded on completion.
- Gives: every paid run is **recorded**, revocable and billable — the "monitored by rap-auth" we want.
- Honest limit: a patched build can skip the check. It is a licence gate, not a lock.

**Tier 2 — the real dependency (build next; this is the one that bites).** Move the **aluminium profile
catalogue / rate book** into the cloud, served per entitlement.
- `ParacoreAluminum.cs` already anticipates it: *"section geometry is nominal and not yet checked against
  the LTZ catalogue."* That catalogue is **data**, it is the actual IP, and the **cutting list and
  procurement summary cannot be produced without it**.
- Then bypassing the check yields a measured but **uncosted** report — which is not the product.

**Tier 3 — the deliverable's seal (optional polish).** The cloud issues the Book cover's provenance block
(project, run id, date, a verification URL). A copied run produces an unverifiable book.

**Where to start (all Python; no engine change):**
1. `rap-auth-server` — add **entitlements** to the user/team (it already issues memberships).
2. `rap-server` — add `POST /executions/authorize` + `POST /executions/{id}/complete`, and a `runs` table
   (it already has a DB, migrations, and a `runs_router`).
3. Extend the **existing** `__license_tier__` injection to carry the entitlement set / run token.
4. The pack command checks it before exporting. ⚠ **Around** `SchedulesExportService.cs`, never inside it.

**⚠ The note that outranks all of it:** for the **service** model — you running the takeoff — none of this
is needed. You control the machine. The gate exists only for the self-serve product.

---

## 11. Open decisions for you

1. **Scope #1** — confirm **Paras Plastering** as the first service, or another.
2. **Hosting budget** — accept ~$5–10/month on Railway? (The "free" path is a trial, not a home.)
3. **Worker model** — does the cloud queue jobs onto **your** machine only, or do you want clients to
   run their own worker later? (Affects Phase 2 identity design.)
4. **Data policy** — will you accept a **digest** (dimensions) rather than the full model? This decides
   how much can ever leave the client's building.
5. **IFC appetite** — is the Phase-4 Revit-free product a "yes, eventually," or a core goal?

---

## 12. ⏸ PAUSED — RESUME HERE (state as of 2026-10-12)

**Why we stopped.** The goal was **relief, not a product**. The user's words: *"you proved to me it is
possible and I'm happy … now we know we can provide cloud services."* **That question is answered.**
The active workstream is now **TikTok / outreach** — the bottleneck is **reach, not engineering**.

### What we did (2026-10-12) — all of it
1. **Verified the premise, wrote no code.** The auth server is **already live** on Railway
   (`https://rap-auth-server-production.up.railway.app`; valid RSA key fetched), and the
   `AddinBridge.Subscribe` **reverse tunnel** already exists in `protos/corescript.proto`. This was
   never "build a platform" — it is "move the boundary".
2. **Cleared the one blocker — Phase 0, the configurable seam.** Built, installed, and **proved present
   in the shipped DLLs** by UTF-16 scan; the live round trip (MCP → sidecar → add-in → Revit)
   answered after the rebuild. Details in §1 and §7/Phase 0.
3. **Discovered the MCP half was already done** — `GRPC_SERVER_ADDRESS` in both MCP clients. The chain
   is redirectable today **with zero code changes**.
4. **Settled the protection question by rejecting it.** §9: code cannot be protected by cloud delivery
   — an assembly that loads on the customer's machine *is on their machine*. The moat is the
   **service, the rate book, and provenance**, not secrecy.
5. **Named the real bottleneck** — business and reach, not engineering.

### What remains — nothing here is urgent, and none of it blocks revenue today
| # | Item | Blocked on |
|---|---|---|
| 1 | **L2 two-machine test** — sidecar on PC-A, add-in on PC-B over Tailscale, 3× incl. after restart | **Nothing.** Needs a friend + ~30 min. **Start here on resume.** |
| 2 | **Phase 1** — lift `rap-server` to Railway + Postgres | Accepting **~$5–10/month** (§11.2) |
| 3 | **Phase 2** — add-in registers as a cloud worker (dials out, pulls jobs) | Phase 1 |
| 4 | **Phase 3** — first scope as a **service** (Paras Plastering), end to end | Scope #1 confirmed (§11.1) |
| 5 | **Cloud dependency** — Tier 1 (per-run authorisation + run id), then Tier 2 (rate book) | Only for the **self-serve** product. **Not needed for services.** |
| 6 | **Phase 4** — Revit-free IFC path (IfcOpenShell) | §11.5 |
| 7 | **Housekeeping** — unify the env-var name; fix the misleading diagnostic text | Optional, cosmetic |
| 8 | **§11 decisions** — scope #1, budget, worker model, data policy, IFC appetite | **The user** |

### ⚠ Three things not to re-litigate when resuming
- **The engine cannot move to the cloud.** `CoreScript.Engine` is Revit-bound (46 files reference the
  Revit API) and the Book renders pictures of the model. Execution stays where Revit is. Permanently.
- **Do not re-add the MCP-side seam.** `GRPC_SERVER_ADDRESS` is already there.
- **Do not re-open §9 (code protection).** It was decided, deliberately, against.

### ⚠ And the one that actually matters
**A first paying client needs NONE of the above.** It can be served with what already exists — run the
takeoff locally, deliver the BOQ. **Do not let infrastructure work stand in for outreach.**

---

## Appendix — file-level pointers

- Endpoints (**Phase 0 done**): `Paracore.Addin/Services/CoreScriptClient.cs:62` →
  `PARACORE_SIDECAR_URL`; `Paracore.Server/Program.cs:68` → `PARACORE_SIDECAR_BIND`; the MCPs already
  used `GRPC_SERVER_ADDRESS` (`paracore-gen|paracore-takeoff/grpc_client.py:38,60`);
  `corescript-vscode/src/grpcClient.ts:19` stays hardcoded **on purpose** (free, out of scope).
- The seam: `protos/corescript.proto` (`AddinBridge`, `TaskEnvelope`)
- Control plane: `rap-server/server/main.py`, `config.py`, `auth.py`, `api/auth_router.py`
- Live auth: `https://rap-auth-server-production.up.railway.app`
- AI brain: `paracore-gen` (imported by `rap-server` via `main.py:18-29`)

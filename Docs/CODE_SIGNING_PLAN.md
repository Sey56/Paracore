# CODE SIGNING PLAN — the three installers

**Date:** 2026-10-22
**Scope:** `build-addin.ps1`, `build-frontend.ps1` (repo `paracore`), `build-gen.ps1` (repo `paracore-gen`)
**Status:** plan. Nothing signed yet. One piece is already built and run — see §3.

---

## 1. What is actually unsigned — measured, not assumed

Run on this machine, 2026-10-22, with `scripts/Test-Signed.ps1`:

| Artifact | Built by | Size | Signature |
|---|---|---|---|
| `installers\Paracore_4.8.0_x64.msi` | `build-frontend.ps1` (Tauri + WiX) | 45.7 MB | **NotSigned** |
| `installers\Paracore_Addin_v4.8.0.exe` | `build-addin.ps1` (Inno Setup) | 10.6 MB | **NotSigned** |
| `paracore-gen\installers\Paracore-Gen-v2.0.0.exe` | `build-gen.ps1` (Inno Setup) | 26.9 MB | **NotSigned** |
| `installers\corescript-4.8.0.vsix` | *not one of the three* | 0.2 MB | n/a — a VSIX is a ZIP; the Marketplace signs it |

`build-addin.ps1` already carries a placeholder for this at lines 141–150:

```powershell
# --- Code Signing (Placeholder) ---
Write-Host "`n[INFO] Skipping code signing."
# $certPath = "path\to\your\certificate.pfx"
```

⚠ **That commented-out approach no longer exists.** Since **2023-06-01**, the CA/Browser Forum
requires code-signing private keys to be generated and held in FIPS 140-2 Level 2 or Common
Criteria EAL4+ hardware. No CA will issue you a `.pfx` file. Any plan built on a PFX is dead on
arrival — including most tutorials still online.

---

## 2. The part everyone gets wrong: sign the payload, then the container

Signing only the installer is **not enough**. The installer is a container; what the user runs
afterwards is a separate, unsigned file. If you sign the `.exe`/`.msi` and stop, the app that
launches from the Start menu is still unsigned, and SmartScreen/AV will flag it on first run.

The order is therefore:

```
1. build        -> unsigned binaries
2. SIGN         -> the payload  (DLLs, .exe)          <-- must happen BEFORE packaging
3. package      -> installer contains signed payload
4. SIGN         -> the installer, with a timestamp    <-- and the uninstaller
5. verify       -> gate the build on the result
```

Per script, that means:

| Script | Sign at step 2 (payload) | Sign at step 4 (container) |
|---|---|---|
| `build-addin.ps1` | `Paracore.Addin.dll`, `Paracore.Shim.dll` in `$resolvedPublishDir` | `Paracore_Addin_v{ver}.exe` + its uninstaller |
| `build-frontend.ps1` | `Paracore.exe` and sidecar binaries | `Paracore_{ver}_x64.msi` |
| `build-gen.ps1` | `dist\paracore-gen.exe` | `Paracore-Gen-v{ver}.exe` + its uninstaller |

**Timestamps are mandatory.** Without one, every installer you have already shipped starts showing
"Unknown publisher" the day the certificate expires. `Test-Signed.ps1` fails a signature that has
no timestamp for exactly this reason.

⚠ **The `.ptool` products cannot be signed.** They are JSON with a base64 assembly, not PE images.
Their integrity has to come from transport (HTTPS) or from Paracore verifying a hash at load. This
plan does not cover them, and no certificate will.

---

## 3. Already done — the gate

`paracore/scripts/Test-Signed.ps1` is written **and has been run** against the three artifacts
above. It checks, per file: signature status, whether a timestamp exists, the digest algorithm, and
optionally that the signer matches an expected publisher name.

```powershell
.\scripts\Test-Signed.ps1                  # gate: exit 1 on any bad artifact
.\scripts\Test-Signed.ps1 -AllowUnsigned   # report only, during the pre-cert period
.\scripts\Test-Signed.ps1 -ExpectedPublisher "Paras"
```

It is deliberately written to fail on `NotSigned`, `HashMismatch`, `NotTrusted`, `UnknownError`,
and on a `Valid` signature with no timestamp. It skips `.vsix`/`.zip` rather than misreport them.

**Verified output today:** `3 of 3 artifact(s) would not be trusted by a user`, exit 0 with
`-AllowUnsigned`. Once signing is wired in, remove the switch and the build fails on regression.

---

## 4. The options — verified facts

| | **SignPath Foundation** | Azure Artifact Signing | Certum Open Source | Self-signed |
|---|---|---|---|---|
| Cost | **$0** | $9.99/mo (5,000 sigs) | ~€29/yr | $0 |
| Publisher shown to the user | **"SignPath Foundation"** | your verified identity | your org | "Unknown publisher" |
| Private key held | their HSM | their HSM | cloud / token | a local file |
| Works with the **local** PowerShell builds | ❌ requires CI | ✅ signtool locally | ✅ | ✅ |
| Eligibility | OSS project, **reviewed** | identity verification | OSS | none |
| Removes "Unknown publisher" | ✅ | ✅ | ✅ | ❌ **no** |

> **Only the first column is in scope.** The others are kept for comparison so the trade-off is
> visible and does not have to be re-argued later. Nothing in this plan depends on them.

### Verified facts

**SignPath Foundation** — from signpath.org:
> "SignPath Foundation provides you with a code signing certificate."
> "No need for personal identification, **we verify that the binary was built from your open source
> repository and vouch for that with our name**."
> "the private key of your certificate is securely generated and stored on our Hardware Security
> Module (HSM)."
> "**For OSS projects, our services are free of charge.**"

The catch is in the same paragraph: they vouch *with their name*. The certificate subject is
SignPath Foundation, not Paras Codarch. And the signing request must come from a **trusted build
system** — their docs describe origin verification, trusted build systems, and SLSA attestations,
with a GitHub Action (`signpath/github-action-submit-signing-request`) and an artifact-configuration
XML. **Local `.\build-addin.ps1` cannot be signed this way.**

**Azure Artifact Signing** — from the Azure pricing page: Basic **$9.99/month**, 5,000
signatures/month included, **$0.005** each after; Premium $99.99. Opened to individual developers
in public preview (Nov 2024). Needs the Windows SDK `signtool.exe` (≥ 10.0.2261.755 — this machine
has **10.0.26100.0**), the .NET 8 runtime, and the Artifact Signing client dlib, installable via
winget.

**Certum** publishes an "Open Source" code signing product and a cloud option (SimplySign) that
avoids shipping a USB token. Cheapest paid route, least clear eligibility. Fallback only.

**Self-signed** is worth naming so it is not attempted: a self-signed certificate is trusted by
exactly zero machines. It does not remove a single warning. It is not a cheaper version of signing;
it is a different thing that does not work.

---

## 5. The decision — free only

**Budget ruling (2026-10-22): zero recurring cost. The Azure option is off the table.** It is
recorded in §4 only so the comparison is honest; nothing below depends on it.

That leaves exactly **one** route to a trusted signature: **SignPath Foundation.** There is no free
alternative, and it is worth understanding why — the 2023 hardware-key rule means a certificate
cannot be handed to a developer to use locally any more. A free trusted signature is only possible
when somebody else holds the key and signs on your behalf. SignPath is that somebody, for OSS.

### What "free" actually costs — stated once, plainly

**No money.** Two other things:

1. **The builds must move to GitHub Actions.** SignPath signs artifacts submitted from a *trusted
   build system*; a local `.\build-addin.ps1` cannot be signed. This is the real price.
   It is feasible — the blocker people hit first is not a blocker: `Paracore.Addin.csproj` gets the
   Revit API from NuGet (`Nice3point.Revit.Api.*`, `2025.*`), so **Revit does not need to be
   installed on the runner**. The frontend build is heavier (Node + Rust + WiX + uv + the embedded
   Python zip) but runs on `windows-latest`.
2. **The publisher reads "SignPath Foundation", not Paras Codarch.** For the free MIT platform that
   is arguably the truthful label — the signature says "this binary came from the public
   repository." But it is not your company's name on the thing users install.

### And what it does not block

**Signing is not gating anything.** The installers work today; they are unsigned, and users see a
warning they can click through. Nothing on the marketplace, no sale, and no download depends on
this. So the correct sequencing is:

- **Now, free, no CI:** ship the integrity layer in Phase 4 (SHA-256 + GPG). Costs nothing, works
  today, and is the *only* protection available for `.ptool` files, which can never be signed.
- **When there is time:** apply to SignPath Foundation, then do the CI migration.
- **Do not hold a release waiting for either.**

If a trusted signature becomes worth $9.99/month later, §4 still holds the comparison. Until then
it is not a decision to make.

---

## 6. Phase plan

### Phase 0 — Clear the blockers (before applying to anything)

1. **`paracore-gen` has no `LICENSE` file.** `paracore` has MIT. `paracore-gen` is public, and its
   own `build-gen.ps1` writes `LegalCopyright: 'MIT License'` into the version resource — so the
   intent is declared and the file is missing. **Every OSS signing programme requires an OSI
   licence in the repo.** Add `LICENSE` (MIT, same text as `paracore`) and reference it from
   `README.md`.
2. **Decide the publisher name that will appear in the UAC prompt.** Today it is inconsistent:
   `tauri.conf.json` says `"publisher": "Paras Codarch"`, the UI says "Paras Codarch"
   (`Verify-Release.ps1` asserts this), and the company is Paras Partners PLC. The certificate
   subject should match what the user sees. **This is your decision, not mine** — and for Azure
   *organisation* enrolment it must be the registered legal entity.
3. **Decide the scope of the application.** Sign the free platform installers only. Do not present
   the paid `.ptool` business as part of an OSS application — it is not what is being signed, and
   it invites a rejection.

### Phase 1 — Make the builds signing-ready (backend-agnostic, no certificate needed)

This is the real engineering work and it is worth doing regardless of which CA wins.

1. **`scripts/Sign-Artifacts.ps1`** — one function, `Invoke-CodeSign -File <path>`, that reads the
   backend from a single variable (`$env:PARACORE_SIGN_BACKEND` = `azure` | `signpath` | `none`).
   With `none` it prints what it *would* sign and returns success, so the whole pipeline can be
   exercised before a certificate exists.
2. **`build-addin.ps1`** — replace the placeholder block at **lines 141–150**:
   - after `$resolvedPublishDir` is resolved (line 101) and `Paracore.Shim.dll` is copied (line 128),
     sign `Paracore.Addin.dll`, `Paracore.Shim.dll`, and every other `.dll` in that folder;
   - after the ISCC call (line 168), sign `Paracore_Addin_v{ver}.exe`.
3. **`paracore-addin.iss`** — add to `[Setup]`:
   ```
   SignTool=paracore
   SignedUninstaller=yes
   ```
   plus the `[Setup]` `SignTool` definition block, so Inno signs the installer **and** the generated
   uninstaller. (`SignedUninstaller` is the detail that stops the uninstaller being flagged.)
4. **`build-frontend.ps1`** — ⚠ this script **mutates `tauri.conf.json` and restores it from
   `$originalConfig`** (read line 46, written line 173, restored line 199). Any signing config must
   therefore either (a) live permanently in the base `tauri.conf.json`, or (b) be injected into
   `$configObject` alongside the other mutations before line 173. Option (a) is safer.
   The installed Tauri CLI is **1.6.3**, and its schema confirms:
   - `bundle.windows.signCommand` — *"Specify a custom command to sign the binaries. This command
     needs to have a `%1` in it which is just a placeholder for the binary path… By Default we use
     `signtool.exe`"*
   - `certificateThumbprint`, `digestAlgorithm` (SHA-256), `timestampUrl`, and `tsp` (RFC 3161).

   Using `signCommand` signs **both the app exe and the MSI** in one pass — which is exactly the
   §2 requirement, handled by the bundler rather than by hand.
5. **`build-gen.ps1`** — sign `dist\paracore-gen.exe` **after** the prompt-bundling gate (line 182)
   and **before** ISCC (line 223). Signing before the gate would make the gate's failure message
   refer to a signed binary, which is confusing when debugging.
6. **`paracore-gen.iss`** — same `SignTool` + `SignedUninstaller` treatment.
7. **Gate every script.** Append to each build script:
   ```powershell
   & (Join-Path $ProjectRoot 'scripts\Test-Signed.ps1')
   ```
   while the certificate does not exist, pass `-AllowUnsigned`.

### Phase 2 — SignPath Foundation (the free route)

1. **Apply at signpath.org** with the `paracore` and `paracore-gen` repos, the MIT licence, and a
   scope statement covering **the free platform only** — the add-in, the engine, the desktop app and
   `paracore-gen`. Do not present the paid `.ptool` business as part of the application; it is not
   what is being signed, and it invites a rejection. The review takes time, so start it before the
   CI work, not after.
2. **Move the three builds into `.github/workflows/` on `windows-latest`.** This is the real work,
   and it can be done one script at a time — start with `build-gen.ps1`, which has the fewest
   dependencies (uv + PyInstaller + Inno Setup).
3. **Submit each artifact for signing** via the GitHub Action
   (`signpath/github-action-submit-signing-request`) with an artifact-configuration XML per
   artifact type, then download the signed result.
4. **Gate the signed file**, not the unsigned one — `Test-Signed.ps1` runs after the download.
5. Keep the backend behind `$env:PARACORE_SIGN_BACKEND` so a future switch needs no code change.

> Azure Artifact Signing remains a one-line swap if the budget ever allows it. It is not part of
> this plan.

### Phase 3 — Verify on a machine that has never seen the build

1. `Test-Signed.ps1` with **no** `-AllowUnsigned` → exit 0.
2. `signtool verify /pa /all <file>` → success for each artifact.
3. **Install on a clean Windows VM.** The UAC prompt must show the publisher name, not "Unknown".
4. **Check the installed binary, not just the installer** — e.g.
   `C:\Program Files\Paracore\Paracore.exe` must also be `Valid`. This is the check that catches
   the §2 mistake.
5. `Get-AuthenticodeSignature` on the **uninstaller** in the install folder.

### Phase 4 — Release hygiene that costs nothing and works today

Signing proves *who built it*. It does not prove *what you downloaded is what was released*. Add,
in the same release step:

- `SHA256SUMS.txt` covering all three installers, generated after signing;
- a GPG signature over that file (`gpg --detach-sign --armor`), with the public key published;
- the checksums printed on the download page.

This is free, works before any certificate exists, and is the only integrity guarantee available for
the `.ptool` files, which cannot be signed at all.

---

## 7. Definition of done

- [ ] `LICENSE` exists in `paracore-gen`
- [ ] SignPath Foundation application approved for `paracore` + `paracore-gen` (platform only)
- [ ] The three builds run in GitHub Actions and produce the same artifacts as the local scripts
- [ ] Payload signed before packaging, in all three scripts
- [ ] Installer **and** uninstaller signed, with a timestamp
- [ ] `Test-Signed.ps1` runs on the **downloaded signed** artifact and exits 0
- [ ] Clean-VM install shows a publisher name in the UAC prompt, not "Unknown"
- [ ] The **installed** `Paracore.exe` verifies as `Valid`
- [ ] `SHA256SUMS.txt` + GPG signature published with the release *(do this now — it needs no
      certificate and no CI)*

---

## 8. SmartScreen — set expectations now

Signing removes **"Unknown publisher"** from the UAC prompt. It does **not** immediately remove
**"Windows protected your PC."** That second warning is driven by *file reputation* — how many times
that exact binary has been downloaded and run, and whether anyone reported it — not by the
certificate alone. A brand-new signed installer with no download history will still warn.

The honest sequence is: sign → publish → volume → reputation accumulates → warning fades. The
mitigations available in the meantime are a stable download URL, a published checksum, and a
documented support path for users who see the warning. **Do not promise buyers that signing
removes all warnings**, and do not put it on the marketplace as a claim.

---

## 9. What I could not verify

- **Whether SignPath Foundation would approve this project.** The platform is MIT and public, which
  is the stated bar, but the surrounding business is commercial. Unknown until applied.
- **Whether Azure identity validation accepts an Ethiopian individual or registered company**, and
  how long it takes. This is the single biggest schedule risk in the Azure path.
- **Whether SignPath can sign an Inno Setup installer's nested uninstaller.** Their artifact
  configuration is XML-described and flexible, but I did not confirm this case.
- **The exact Artifact Signing CLI syntax** for `signCommand`. Needs the account to exist first.
- **Whether the Tauri MSI signs cleanly with `signCommand` while `certificateThumbprint` is null** —
  the two mechanisms are alternatives, and the interaction should be tested on one build before
  trusting it across releases.

Everything in §1, §3 and the Tauri schema facts in §6 were verified on this machine, today.

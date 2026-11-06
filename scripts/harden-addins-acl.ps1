# ============================================================================
#  harden-addins-acl.ps1 - stop non-elevated code from PLANTING an add-in.
#
#  ⚠⚠ TWO FAILURES ON 2026-11-01, both mine, both dictate the code below.
#
#  1) `/inheritance:r` RAN FIRST. Every ACE on that folder was inherited (`(I)`),
#     so stripping inheritance emptied the DACL - and with an empty DACL nobody,
#     not even Administrators, holds WRITE_DAC. The four grants then failed with
#     exit 5 and the folder became unreadable.
#     => Grant first (each grant only ADDS rights); strip inheritance last, and
#        only after every grant succeeded.
#
#  2) `$ErrorActionPreference = 'Stop'` TURNED stderr INTO A TERMINATING ERROR.
#     `icacls` writes "Access is denied" to stderr, so the very probe meant to
#     decide "can we write here?" aborted the script - before takeown. The
#     repair never ran.
#     => Native tools are driven through Run-Native below: 'Continue', capture
#        2>&1, and decide on $LASTEXITCODE. Never rely on the preference.
#
#  WHY THIS EXISTS
#  ---------------
#  C:\ProgramData\Autodesk\Revit\Addins\2025 granted:
#      BUILTIN\Users:(I)(CI)(WD,AD,WEA,WA)
#  WD = write data / create files. So ANY process running as the user - including
#  code inside Revit - could create a new file there, and a `.addin` manifest
#  placed in this folder is loaded by Revit at the NEXT LAUNCH, with no sandbox
#  and no consent. A file outlives the process that wrote it, so no in-process
#  check can undo it. The product refuses System.IO on the execute_repl channel,
#  but `execute_script` keeps file access (RoomFinishUpdater reads a CSV and
#  writes one), so this ACL is the layer that covers both.
#
#  TARGET ACL
#      SYSTEM            full
#      Administrators    full
#      CREATOR OWNER     full (inherit-only)
#      Users             READ + EXECUTE only   <-- the change
#
#  Revit still loads the add-in (it only reads). install-engine.cmd and the Inno
#  installer still work - they elevate, so they are Administrators.
#
#  ⚠ 2026-11-06: this is no longer a one-folder script - EVERY installed year
#    is hardened. A year whose folder does not exist yet is SKIPPED, not fatal:
#    hardening 2025 must still work where the 2027 folder has not been created.
#
#  ⚠ 2026-11-06 CORRECTION: Revit 2027 moved its ALL-USERS manifest folder to
#    Program Files\Autodesk\Revit\Addins\2027 (Autodesk's 2027 "Add-in
#    Registration" developer guide, confirmed by Revit 2027's own journal:
#    "All-users Add-in manifest files must be installed to: ..."). Program Files
#    is admin-only by default, so the 2027 payload needs NO hardening here. The
#    2027 ProgramData folder is still hardened when present: an earlier build wrote there
#    and Revit 2027 ignores it, but a writable Revit-version-named folder is the
#    kind of stale artifact that misleads the next diagnosis. Keep 2027 in the
#    default list so `undo` still restores a folder hardened earlier.
#
#  BLAST RADIUS: another vendor's add-in installer that writes there WITHOUT
#  elevation will now fail. Those installers normally elevate.
#
#  Usage:
#      harden-addins-acl.cmd              apply to 2025/2026/2027 (all that exist)
#      harden-addins-acl.cmd undo         restore inherited permissions
#      powershell -ExecutionPolicy Bypass -File harden-addins-acl.ps1 -Years 2027
# ============================================================================
param([switch]$Undo, [string[]]$Years = @('2025', '2026', '2027'))

# 'Continue', NOT 'Stop' - see failure (2) above. Control flow uses explicit
# $LASTEXITCODE checks and `throw`, never the preference.
$ErrorActionPreference = 'Continue'

$Log = Join-Path $PSScriptRoot 'harden-addins-acl.log'

function Say($msg, $colour = 'Gray') {
    Write-Host $msg -ForegroundColor $colour
    try { Add-Content -LiteralPath $Log -Value $msg -Encoding utf8 } catch { }
}

# Runs a native tool without letting its stderr abort the script.
function Run-Native {
    param([string]$Exe, [string[]]$ArgList)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & $Exe @ArgList 2>&1
        $code = $LASTEXITCODE
    }
    catch {
        $out = @($_.Exception.Message)
        $code = -1
    }
    finally { $ErrorActionPreference = $prev }
    $text = (($out | ForEach-Object { "$_" }) -join "`n").Trim()
    return [pscustomobject]@{ Code = $code; Text = $text }
}

try { Set-Content -LiteralPath $Log -Value ("=== {0:yyyy-MM-dd HH:mm:ss} undo={1} years={2} ===" -f (Get-Date), $Undo, ($Years -join ',')) -Encoding utf8 } catch { }

$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Say "NOT ELEVATED - changing an ACL needs administrator rights." 'Red'
    Say "Run the .cmd launcher, or right-click it and choose 'Run as administrator'." 'Red'
    throw "Not elevated - no change was made."
}

# Resolve only the folders that actually exist. Missing years are a normal
# state (the installer creates them), not a reason to abort the others.
$dirs = @()
foreach ($year in $Years) {
    $candidate = Join-Path 'C:\ProgramData\Autodesk\Revit\Addins' $year
    if (Test-Path -LiteralPath $candidate) {
        $dirs += $candidate
    }
    else {
        Say ("SKIP - not installed yet: " + $candidate) 'Yellow'
    }
}
if ($dirs.Count -eq 0) {
    throw "No Revit Addins folders to harden. Run the add-in installer first."
}

function Harden-One {
    param([string]$Dir)

    if (-not (Test-Path -LiteralPath $Dir)) { throw "Not found: $Dir" }

    # ── before ─────────────────────────────────────────────────────────────────
    $before = Run-Native 'icacls.exe' @($Dir)
    Say "---- ACL BEFORE ----" 'Cyan'
    if ($before.Code -eq 0) {
        Say $before.Text
    }
    else {
        Say "UNREADABLE - the DACL is empty or denies everyone (the 2026-11-01 break)." 'Red'
        Say "Repairing by taking ownership first." 'Red'
    }

    # ── can we write the DACL? Probe by granting SYSTEM, which is in the target set
    #    anyway, so a successful probe is useful work rather than a throwaway.
    $probe = Run-Native 'icacls.exe' @($Dir, '/grant:r', 'NT AUTHORITY\SYSTEM:(OI)(CI)(F)')
    $tookOwnership = $false

    if ($probe.Code -ne 0) {
        Say "---- taking ownership ----" 'Yellow'
        Say ("  probe failed (" + $probe.Code + "): " + $probe.Text) 'Yellow'
        # ⚠ NO `/D` HERE. `/D <answer>` is the answer to the recursive overwrite
        #   prompt and is valid ONLY with `/R`; takeown rejects it otherwise with
        #   "ERROR: /D should be specified only with /R." (measured 2026-11-01).
        #   Without /R there is no prompt to answer, so the switch is unnecessary.
        #   /R is also unwanted: ownership of the DIRECTORY is what grants WRITE_DAC,
        #   and the children get their access back through inheritance, not ownership.
        $take = Run-Native 'takeown.exe' @('/F', $Dir, '/A')
        if ($take.Code -ne 0) {
            Say ("  takeown failed (" + $take.Code + "): " + $take.Text) 'Red'
            Say ""
            Say "Repair it by hand in an elevated PowerShell, then re-run this script:" 'Red'
            Say ('  takeown /F "' + $Dir + '" /A') 'Red'
            Say ('  icacls "' + $Dir + '" /grant "BUILTIN\Administrators:(OI)(CI)(F)" "NT AUTHORITY\SYSTEM:(OI)(CI)(F)" "BUILTIN\Users:(OI)(CI)(RX)"') 'Red'
            throw "Could not take ownership - nothing else was changed."
        }
        $tookOwnership = $true
        Say "  owner set to BUILTIN\Administrators" 'Yellow'
        # Ownership is the right that makes the DACL writable; retry the probe.
        $probe = Run-Native 'icacls.exe' @($Dir, '/grant:r', 'NT AUTHORITY\SYSTEM:(OI)(CI)(F)')
        if ($probe.Code -ne 0) {
            throw ("Still cannot write the DACL after takeown (" + $probe.Code + "): " + $probe.Text)
        }
    }
    Say "  ok      NT AUTHORITY\SYSTEM:(OI)(CI)(F)" 'Green'

    if ($Undo) {
        Say "---- restoring inherited permissions ----" 'Cyan'
        $g = Run-Native 'icacls.exe' @($Dir, '/grant', 'BUILTIN\Users:(OI)(CI)(RX)')
        if ($g.Code -ne 0) { throw ("grant failed: " + $g.Text) }
        $e = Run-Native 'icacls.exe' @($Dir, '/inheritance:e')
        if ($e.Code -ne 0) { throw ("inheritance:e failed: " + $e.Text) }
    }
    else {
        # ORDER MATTERS. Grants first - each only ADDS rights, so a failure here
        # leaves the folder no worse than it already was.
        Say "---- granting ----" 'Cyan'
        $grants = @(
            'BUILTIN\Administrators:(OI)(CI)(F)',
            'CREATOR OWNER:(OI)(CI)(IO)(F)',
            'BUILTIN\Users:(OI)(CI)(RX)'
        )
        foreach ($g in $grants) {
            $r = Run-Native 'icacls.exe' @($Dir, '/grant:r', $g)
            if ($r.Code -ne 0) {
                Say ("  FAILED  " + $g) 'Red'
                Say ("          " + $r.Text) 'Red'
                throw "grant failed for '$g' - the folder keeps the access it had before this run."
            }
            Say ("  ok      " + $g) 'Green'
        }

        # Only now drop the inherited rows; the explicit ACEs above survive.
        Say "---- removing inheritance (explicit ACEs above are kept) ----" 'Cyan'
        $i = Run-Native 'icacls.exe' @($Dir, '/inheritance:r')
        if ($i.Code -ne 0) { Say ("  WARNING: /inheritance:r returned " + $i.Code + ": " + $i.Text) 'Yellow' }
    }

    # ── after ───────────────────────────────────────────────────────────────────
    $after = Run-Native 'icacls.exe' @($Dir)
    Say ""
    Say "---- ACL AFTER ----" 'Cyan'
    Say $after.Text

    # ── VERIFY ──────────────────────────────────────────────────────────────────
    #  The ROOT is not enough. The 2026-11-01 break emptied the root's DACL and
    #  every CHILD inherited that emptiness, so `Paracore` was unreadable while the
    #  root could look fine. Check a real child or the repair looks green while the
    #  add-in folder is still dead.
    $canList = $true
    try { $null = Get-ChildItem -LiteralPath $Dir -Force -ErrorAction Stop } catch { $canList = $false }

    $childDir = Join-Path $Dir 'Paracore'
    $canListChild = $true
    if (Test-Path -LiteralPath $childDir) {
        try { $null = Get-ChildItem -LiteralPath $childDir -Force -ErrorAction Stop } catch { $canListChild = $false }
    }

    $usersWrite = $null
    try {
        $usersWrite = (Get-Acl -LiteralPath $Dir).Access | Where-Object {
            $_.IdentityReference.Value -like '*\Users' -and (([int]$_.FileSystemRights -band 6) -ne 0)
        }
    }
    catch { Say ("  (could not read the ACL object: " + $_.Exception.Message + ")") 'Yellow' }

    if (-not $canList -or -not $canListChild) {
        Say ""
        Say ("*** FAILED: still unreadable (root=" + $canList + ", Paracore=" + $canListChild + ") ***") 'Red'
        throw "Folder is not fully readable - do not leave it in this state."
    }

    if ($Undo) {
        Say ""
        Say "UNDO OK - inheritance restored; Users can create files here again." 'Green'
    }
    elseif ($usersWrite) {
        Say ""
        Say "*** FAILED: BUILTIN\Users STILL has write/create rights. ***" 'Red'
        $usersWrite | ForEach-Object { Say ("    " + $_.IdentityReference + "  " + $_.FileSystemRights) 'Red' }
        throw "The ACL change did not take effect."
    }
    else {
        Say ""
        Say "OK - Users can read and execute here, but cannot create a file." 'Green'
        Say "     Revit can still load the add-in; install-engine.cmd still works (it elevates)." 'Green'
        if ($tookOwnership) { Say "     NOTE: owner is now BUILTIN\Administrators (was SYSTEM). Harmless." 'Yellow' }
    }
}

# One failure must not leave the OTHER years unprotected, so collect and report
# every failure instead of throwing out of the loop on the first one.
$failures = @()
foreach ($d in $dirs) {
    Say ""
    Say ("==== " + $d + " ====") 'Cyan'
    try {
        Harden-One -Dir $d
    }
    catch {
        $failures += ($d + " : " + $_.Exception.Message)
        Say ("*** FAILED: " + $_.Exception.Message) 'Red'
    }
}

if ($failures.Count -gt 0) {
    Say ""
    foreach ($f in $failures) { Say ("*** " + $f) 'Red' }
    throw ("$($failures.Count) folder(s) were not hardened. See the log.")
}

Say ""
Say ("DONE - " + $dirs.Count + " Revit Addins folder(s) hardened/verified.") 'Green'

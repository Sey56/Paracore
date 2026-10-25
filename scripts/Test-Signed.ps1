# Test-Signed.ps1
#
# The release gate for code signatures. Answers one question per artifact:
#   "will a user's Windows machine trust this file, and will it still be trusted
#    after the certificate expires?"
#
# Written 2026-10-22. Until a certificate exists, run it with -AllowUnsigned to
# see the current state without failing a build. Once signing is wired in, drop
# the switch and the build fails on any unsigned or untimestamped artifact.
#
# Usage:
#   .\scripts\Test-Signed.ps1                          # gate installers/ + paracore-gen/installers/
#   .\scripts\Test-Signed.ps1 -AllowUnsigned           # report only, never fail
#   .\scripts\Test-Signed.ps1 -Path X.exe,Y.msi        # check specific files
#   .\scripts\Test-Signed.ps1 -ExpectedPublisher "Paras"   # assert the signer
#
# Exit codes: 0 = all good, 1 = at least one artifact failed.

[CmdletBinding()]
param(
    [string[]]$Path,
    [switch]$AllowUnsigned,
    [string]$ExpectedPublisher,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

# --- Resolve what to check ---------------------------------------------------
# A .vsix is a ZIP, not a PE image. Get-AuthenticodeSignature cannot read it and
# reports UnknownError, which looks like a failure. Skip it explicitly rather
# than let it poison the gate — VS Code Marketplace signs extensions itself.
$skippedExtensions = @('.vsix', '.zip', '.json', '.txt', '.sha256')

if (-not $Path -or $Path.Count -eq 0) {
    $roots = @(
        (Join-Path (Get-Location) 'installers'),
        (Join-Path (Split-Path (Get-Location) -Parent) 'paracore-gen\installers')
    )
    $found = @()
    foreach ($r in $roots) {
        if (Test-Path $r) {
            $found += Get-ChildItem -Path $r -File |
                      Where-Object { $_.Extension -in @('.exe', '.msi', '.dll') }
        }
    }
    $Path = $found | Select-Object -ExpandProperty FullName
}

if (-not $Path -or $Path.Count -eq 0) {
    Write-Host 'No artifacts found to check. Build something first.' -ForegroundColor Yellow
    exit 1
}

# --- Check each ---------------------------------------------------------------
$results = @()

foreach ($file in $Path) {
    if (-not (Test-Path $file)) {
        $results += [PSCustomObject]@{
            File      = Split-Path $file -Leaf
            Status    = 'MISSING'
            Timestamp = '-'
            Digest    = '-'
            Signer    = '-'
            Ok        = $false
            Note      = 'file not found'
        }
        continue
    }

    $item = Get-Item $file
    if ($skippedExtensions -contains $item.Extension.ToLower()) {
        $results += [PSCustomObject]@{
            File = $item.Name; Status = 'SKIP'; Timestamp = '-'; Digest = '-'
            Signer = '-'; Ok = $true; Note = 'not a PE image'
        }
        continue
    }

    $sig = Get-AuthenticodeSignature -FilePath $item.FullName

    # A timestamp is not optional. Without one the signature dies the day the
    # certificate expires, and every already-shipped installer starts warning.
    $hasTimestamp = $null -ne $sig.TimeStamperCertificate

    # SHA-1 signatures are rejected by current Windows policy in practice.
    $digest = '-'
    if ($sig.SignerCertificate) {
        $digest = $sig.SignerCertificate.SignatureAlgorithm.FriendlyName
    }

    $ok = ($sig.Status -eq 'Valid') -and $hasTimestamp

    $note = ''
    if ($sig.Status -eq 'NotSigned') { $note = 'UNSIGNED' }
    elseif ($sig.Status -eq 'HashMismatch') { $note = 'FILE MODIFIED AFTER SIGNING' }
    elseif ($sig.Status -eq 'NotTrusted') { $note = 'chain not trusted on this machine' }
    elseif ($sig.Status -eq 'UnknownError') { $note = 'signature unreadable' }
    elseif ($sig.Status -eq 'Valid' -and -not $hasTimestamp) { $note = 'NO TIMESTAMP - expires with the cert' }

    if ($ok -and $ExpectedPublisher) {
        if ($sig.SignerCertificate.Subject -notlike "*$ExpectedPublisher*") {
            $ok = $false
            $note = "signer is not '$ExpectedPublisher'"
        }
    }

    $results += [PSCustomObject]@{
        File      = $item.Name
        Status    = $sig.Status
        Timestamp = if ($hasTimestamp) { 'yes' } else { 'NO' }
        Digest    = $digest
        Signer    = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { '(none)' }
        Ok        = $ok
        Note      = $note
    }
}

# --- Report -------------------------------------------------------------------
if (-not $Quiet) {
    Write-Host ''
    Write-Host '--- Code signature check ---' -ForegroundColor Cyan
    Write-Host ''
    $table = $results | Format-Table File, Status, Timestamp, Digest, Note -AutoSize | Out-String
    Write-Host $table.TrimEnd()
    foreach ($r in $results) {
        if ($r.Signer -ne '-') {
            Write-Host ("  {0}" -f $r.File) -ForegroundColor DarkGray
            Write-Host ("    signer: {0}" -f $r.Signer) -ForegroundColor DarkGray
        }
    }
    [Console]::WriteLine()
}

$failed = @($results | Where-Object { -not $_.Ok })

if ($failed.Count -eq 0) {
    Write-Host "All $($results.Count) artifact(s) signed, timestamped and trusted." -ForegroundColor Green
    exit 0
}

Write-Host "$($failed.Count) of $($results.Count) artifact(s) would not be trusted by a user:" -ForegroundColor Red
foreach ($f in $failed) {
    Write-Host ("  - {0}: {1}" -f $f.File, $(if ($f.Note) { $f.Note } else { $f.Status })) -ForegroundColor Red
}

if ($AllowUnsigned) {
    Write-Host 'AllowUnsigned set - reporting only, not failing.' -ForegroundColor Yellow
    exit 0
}

Write-Host 'Gate FAILED. Do not publish these artifacts.' -ForegroundColor Red
exit 1

# Tier 2 FULL TEST-PROJECT RESET through a verified psql connection. Never run automatically.
#   powershell -NoProfile -ExecutionPolicy Bypass -File tests\integration\supabase\reset-test-project.ps1          (preview: rolled back)
#   powershell -NoProfile -ExecutionPolicy Bypass -File tests\integration\supabase\reset-test-project.ps1 -Apply   (commits, after confirmation)
# Removes only records demonstrably created by the integration admin (see reset.sql).

param([switch]$Apply)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "tier2-common.ps1")

try {
  $verified = Read-Tier2VerifiedConnection
  $conn = $verified.Connection
  $childEnv = Get-Tier2PgEnvironment $conn
  $childEnv["SOPHIA_T2_REF"] = $conn.Ref
  $childEnv["SOPHIA_T2_ADMIN_EMAIL"] = $verified.Summary.adminEmail
  $psqlArgs = @("-X", "-w", "-v", "ON_ERROR_STOP=1")
  if ($Apply) {
    $confirm = (Read-Host "Type RESET $($conn.Ref) to commit the reset").Trim()
    if ($confirm -ne "RESET $($conn.Ref)") { throw "Not confirmed. Nothing was changed." }
    $psqlArgs += @("-v", "apply=1")
  }
  $psqlArgs += @("-f", (Join-Path $PSScriptRoot "reset.sql"))
  $r = Invoke-Tier2Process -FilePath (Get-Tier2PsqlPath) -ArgumentList $psqlArgs -Environment $childEnv
  ($r.Lines + $r.Errors) | ForEach-Object { Write-Host "  $_" }
  if ($r.Code -ne 0) { throw "Reset refused or failed (psql exit $($r.Code)). Nothing was committed." }
}
catch {
  Write-Host (Protect-Tier2Text $_.Exception.Message) -ForegroundColor Red
  exit 1
}
finally {
  $conn = $null; $verified = $null; $childEnv = $null
  Clear-Tier2Secrets
  [GC]::Collect()
}

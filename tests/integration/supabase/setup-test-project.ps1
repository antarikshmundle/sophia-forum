# Tier 2 one-time setup of the disposable TEST project through a verified psql connection (never the SQL Editor).
#   powershell -NoProfile -ExecutionPolicy Bypass -File tests\integration\supabase\setup-test-project.ps1
# Creates the admin and manager profiles for the test users named in .env.integration.local and the marker row, whose
# ref is the VERIFIED connection's ref. See setup-test-project.sql for its own refusals.

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "tier2-common.ps1")

try {
  $verified = Read-Tier2VerifiedConnection
  $conn = $verified.Connection
  $childEnv = Get-Tier2PgEnvironment $conn
  $childEnv["SOPHIA_T2_REF"] = $conn.Ref
  $childEnv["SOPHIA_T2_ADMIN_EMAIL"] = $verified.Summary.adminEmail
  $childEnv["SOPHIA_T2_MANAGER_EMAIL"] = $verified.Summary.managerEmail
  $childEnv["SOPHIA_T2_NOPROFILE_EMAIL"] = $verified.Summary.noProfileEmail
  $sql = Join-Path $PSScriptRoot "setup-test-project.sql"
  $r = Invoke-Tier2Process -FilePath (Get-Tier2PsqlPath) -ArgumentList @("-X", "-w", "-q", "-v", "ON_ERROR_STOP=1", "-f", $sql) -Environment $childEnv
  ($r.Lines + $r.Errors) | ForEach-Object { Write-Host "  $_" }
  if ($r.Code -ne 0) { throw "Setup refused or failed (psql exit $($r.Code)). Nothing was committed." }
  Write-Host "Setup complete for the test project $($conn.Ref)."
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

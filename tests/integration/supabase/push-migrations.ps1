# Tier 2: push the repository migrations to the disposable TEST project only (Windows PowerShell 5.1).
#   powershell -NoProfile -ExecutionPolicy Bypass -File tests\integration\supabase\push-migrations.ps1
# Safety (see tier2-common.ps1):
#   - verified identity: connection ref = typed ref = .env.integration.local ref = allowlisted; staging/production denied;
#   - the password goes to the CLI only through its environment (PGPASSWORD); the --db-url argument has no password;
#   - the CLI runs in a temporary workdir holding only a copy of supabase/migrations: no linked-project state, so the
#     project this repository is linked to (staging) can't be used;
#   - the real push runs only after a successful dry run that lists every migration, and after you retype the ref.

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "tier2-common.ps1")
$cli = "supabase@2.122.0"
$workdir = $null

try {
  $verified = Read-Tier2VerifiedConnection
  $conn = $verified.Connection
  $dbUrl = "postgresql://$($conn.User)@$($conn.Host):$($conn.Port)/$($conn.Database)?sslmode=require"   # no password
  $npx = (Get-Command npx.cmd -ErrorAction Stop).Source

  $workdir = Join-Path ([IO.Path]::GetTempPath()) ("sophia-push-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
  New-Item -ItemType Directory -Path (Join-Path $workdir "supabase\migrations") | Out-Null
  Copy-Item (Join-Path $script:Tier2Root "supabase\migrations\*.sql") (Join-Path $workdir "supabase\migrations")
  Copy-Item (Join-Path $script:Tier2Root "supabase\config.toml") (Join-Path $workdir "supabase")
  if (Test-Path (Join-Path $workdir "supabase\.temp")) { throw "REFUSED: linked-project state in the workdir." }
  $migrations = @(Get-ChildItem (Join-Path $workdir "supabase\migrations") -Filter *.sql | Sort-Object Name | ForEach-Object { $_.Name })
  Write-Host "Migrations in the repository: $($migrations.Count)"

  $childEnv = @{ PGPASSWORD = $conn.Password; PGSSLMODE = "require" }
  $dry = Invoke-Tier2Process -FilePath $npx -ArgumentList @("--yes", $cli, "db", "push", "--db-url", $dbUrl, "--workdir", $workdir, "--dry-run") -Environment $childEnv
  ($dry.Lines + $dry.Errors) | ForEach-Object { Write-Host "  $_" }
  if ($dry.Code -ne 0) { throw "Dry run failed (exit $($dry.Code)). Nothing was applied. (If the CLI did not accept the password from PGPASSWORD, stop here and report it; do not put the password in the URL.)" }
  $text = ($dry.Lines + $dry.Errors) -join "`n"
  $notListed = @($migrations | Where-Object { -not $text.Contains($_) })
  if ($notListed.Count -gt 0) { throw "Dry run does not list: $($notListed -join ', '). Nothing was applied (is the test project already migrated?)." }
  Write-Host "Dry run OK: all $($migrations.Count) migrations would be applied to $($conn.Ref)."

  $again = (Read-Host "Type the test project ref again to apply the migrations").Trim()
  if ($again -ne $conn.Ref) { throw "Not confirmed. Nothing was applied." }
  $push = Invoke-Tier2Process -FilePath $npx -ArgumentList @("--yes", $cli, "db", "push", "--db-url", $dbUrl, "--workdir", $workdir) -Environment $childEnv
  ($push.Lines + $push.Errors) | ForEach-Object { Write-Host "  $_" }
  if ($push.Code -ne 0) { throw "Push failed (exit $($push.Code))." }
  Write-Host "Migrations applied to the test project $($conn.Ref)."
}
catch {
  Write-Host (Protect-Tier2Text $_.Exception.Message) -ForegroundColor Red
  exit 1
}
finally {
  $conn = $null; $verified = $null; $childEnv = $null
  Clear-Tier2Secrets
  if ($workdir -and (Test-Path $workdir)) { Remove-Item -Recurse -Force $workdir }
  [GC]::Collect()
}

# Offline self-tests for tier2-common.ps1 (no network, no database, no prompts).
#   powershell -NoProfile -ExecutionPolicy Bypass -File tests\integration\supabase\tier2-common.tests.ps1
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "tier2-common.ps1")

$script:passed = 0; $script:failed = 0
function Check([string]$Name, [scriptblock]$Test) {
  try { if (& $Test) { $script:passed++; Write-Host "PASS  $Name" } else { $script:failed++; Write-Host "FAIL  $Name" -ForegroundColor Red } }
  catch { $script:failed++; Write-Host "FAIL  $Name ($($_.Exception.Message))" -ForegroundColor Red }
}
function Refuses([scriptblock]$Block, [string]$Pattern) {
  try { & $Block; return $false } catch { return ($_.Exception.Message -match $Pattern) }
}

$ref = "abcdefghijklmnopqrst"
$pooler = "postgresql://postgres.$ref" + ":s3cr%40t-pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
$direct = "postgres://postgres:s3cr%40t-pw@db.$ref.supabase.co:5432/postgres?sslmode=require"

Check "parses a session-pooler string: ref, user, host, decoded password" {
  $c = ConvertFrom-Tier2ConnectionString $pooler
  $c.Ref -eq $ref -and $c.Kind -eq "session-pooler" -and $c.User -eq "postgres.$ref" -and $c.Password -eq "s3cr@t-pw" -and $c.Port -eq "5432"
}
Check "parses a direct string" { $c = ConvertFrom-Tier2ConnectionString $direct; $c.Ref -eq $ref -and $c.Kind -eq "direct" -and $c.Host -eq "db.$ref.supabase.co" }
Check "refuses the transaction pooler port" { Refuses { ConvertFrom-Tier2ConnectionString ($pooler -replace ":5432/", ":6543/") } "port 5432" }
Check "refuses a non-Supabase host" { Refuses { ConvertFrom-Tier2ConnectionString "postgresql://postgres:pw@db.example.com:5432/postgres" } "identify a project" }
Check "refuses a pooler host with a plain user (no ref)" { Refuses { ConvertFrom-Tier2ConnectionString "postgresql://postgres:pw@aws-0-x.pooler.supabase.com:5432/postgres" } "identify a project" }
Check "refuses a mismatched direct user" { Refuses { ConvertFrom-Tier2ConnectionString "postgresql://postgres.$ref`:pw@db.$ref.supabase.co:5432/postgres" } "identify a project" }
Check "refuses a missing password" { Refuses { ConvertFrom-Tier2ConnectionString "postgresql://postgres@db.$ref.supabase.co:5432/postgres" } "connection string" }
Check "refuses another database" { Refuses { ConvertFrom-Tier2ConnectionString "postgresql://postgres:pw@db.$ref.supabase.co:5432/other" } "'postgres'" }
Check "parse errors never echo the input" {
  try { ConvertFrom-Tier2ConnectionString "postgresql://postgres:TOPSECRET@evil.example:5432/postgres"; $false } catch { -not $_.Exception.Message.Contains("TOPSECRET") }
}

$allow = @{ Allowed = @($ref); Denied = @("mqvhuvtakzrnvuvkkgyt", "mcbsxthyjmptrgfppbsa") }
Check "allowlisted ref passes" { Assert-Tier2Ref $ref $allow "X"; $true }
Check "staging is refused even if allowlisted" { Refuses { Assert-Tier2Ref "mqvhuvtakzrnvuvkkgyt" @{ Allowed = @("mqvhuvtakzrnvuvkkgyt"); Denied = $allow.Denied } "X" } "sophia-cms-staging" }
Check "production is refused even if allowlisted" { Refuses { Assert-Tier2Ref "mcbsxthyjmptrgfppbsa" @{ Allowed = @("mcbsxthyjmptrgfppbsa"); Denied = $allow.Denied } "X" } "production" }
Check "a ref that is not allowlisted is refused" { Refuses { Assert-Tier2Ref "zzzzzzzzzzzzzzzzzzzz" $allow "X" } "not in ALLOWED_TEST_REFS" }
Check "the real allowlist (read by node) has no allowed ref yet and denies staging + production" {
  $real = Get-Tier2Allowlist
  $real.Allowed.Count -eq 0 -and ($real.Denied -contains "mqvhuvtakzrnvuvkkgyt") -and ($real.Denied -contains "mcbsxthyjmptrgfppbsa")
}

Clear-Tier2Secrets
$c = ConvertFrom-Tier2ConnectionString $pooler
Add-Tier2Secret $pooler; Add-Tier2Secret $c.Password; Add-Tier2Secret $c.EncodedPassword
Check "redacts the full connection string" { -not (Protect-Tier2Text "using $pooler now").Contains("s3cr") }
Check "redacts the bare decoded and encoded password" { $t = Protect-Tier2Text "pw is s3cr@t-pw / s3cr%40t-pw"; -not $t.Contains("s3cr") }
Check "redacts password=/PGPASSWORD= forms of unknown values" { $t = Protect-Tier2Text "password=other-secret PGPASSWORD=x2 Password: 'q q'"; -not ($t -match "other-secret|x2|q q") }
Check "redacts any postgres URL" { -not (Protect-Tier2Text "postgres://u:zz@h:1/d").Contains("zz") }

$node = (Get-Command node).Source
$env:PGPASSWORD = "inherited-should-be-removed"
try {
  Check "child gets only the given PG variables; inherited PG* are removed; the password is not an argument" {
    $r = Invoke-Tier2Process -FilePath $node -ArgumentList @("-e", "console.log(JSON.stringify({pw: process.env.PGPASSWORD, host: process.env.PGHOST ?? null, argv: process.argv.slice(1)}))") -Environment @{ PGPASSWORD = "child-only-pw" }
    $o = ($r.Lines -join "") | ConvertFrom-Json
    $o.pw -eq "child-only-pw" -and $null -eq $o.host -and (($o.argv -join " ") -notmatch "child-only-pw")
  }
} finally { Remove-Item Env:PGPASSWORD }
Check "child output is redacted line by line" {
  Clear-Tier2Secrets; Add-Tier2Secret "leaky-value-123"
  $r = Invoke-Tier2Process -FilePath $node -ArgumentList @("-e", "console.log('a leaky-value-123 b'); console.error('password=zzz')") -Environment @{}
  -not (($r.Lines + $r.Errors) -join " ").Contains("leaky-value-123") -and -not (($r.Errors -join " ") -match "zzz")
}
Check "a dirty shell is refused" {
  $env:PGHOST = "db.example.com"
  try { Refuses { Assert-Tier2CleanShell } "PGHOST" } finally { Remove-Item Env:PGHOST }
}
Clear-Tier2Secrets

Write-Host ""
Write-Host "$script:passed passed, $script:failed failed"
if ($script:failed -gt 0) { exit 1 }

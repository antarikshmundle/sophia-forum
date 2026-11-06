# Tier 2 execution-flow tests against a DISPOSABLE LOCAL PostgreSQL cluster only (no Supabase, no network database).
#   powershell -NoProfile -ExecutionPolicy Bypass -File tests\integration\supabase\local-flow.tests.ps1 [-SkipCli]
# The cluster mimics what matters here: TLS required (hostssl only) and SCRAM password authentication, so PGPASSWORD
# is really used. It gets the Supabase stand-in (tests/integration/db/supabase-shim.sql), the nine migrations and three
# test users, then runs setup-test-project.sql and reset.sql exactly as the .ps1 wrappers do (same psql arguments,
# same child environment from tier2-common.ps1). reset.sql is only ever run as a PREVIEW (never apply=1).
# The cluster, its folder and every temporary file are removed at the end, also after failures.
param([switch]$SkipCli)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "tier2-common.ps1")

$pgBin = $env:SOPHIA_PG_BIN; if (-not $pgBin) { $pgBin = "D:\PostgreSQL\bin" }
$openssl = $env:SOPHIA_OPENSSL; if (-not $openssl) { $openssl = "D:\Git\usr\bin\openssl.exe" }
$ref = "localtiertwotest0001"
$users = @{ admin = "00000000-0000-4000-a000-0000000000a1"; manager = "00000000-0000-4000-a000-0000000000a2"; noprofile = "00000000-0000-4000-a000-0000000000a3" }
$emails = @{ admin = "t2-admin@local.test"; manager = "t2-manager@local.test"; noprofile = "t2-noprofile@local.test" }
$setupSql = Join-Path $PSScriptRoot "setup-test-project.sql"
$resetSql = Join-Path $PSScriptRoot "reset.sql"
$RUN = "it-202611050907-8000"

$script:passed = 0; $script:failed = 0; $script:notes = @()
function Check([string]$Name, [scriptblock]$Test) {
  try { if (& $Test) { $script:passed++; Write-Host "PASS  $Name" } else { $script:failed++; Write-Host "FAIL  $Name" -ForegroundColor Red } }
  catch { $script:failed++; Write-Host "FAIL  $Name ($(Protect-Tier2Text $_.Exception.Message))" -ForegroundColor Red }
}

# ---------------------------------------------------------------- the exact psql arguments of the wrappers
$SetupArgs = @("-X", "-w", "-q", "-v", "ON_ERROR_STOP=1", "-f", $setupSql)
$ResetBase = @("-X", "-w", "-v", "ON_ERROR_STOP=1")
Check "harness uses the same psql arguments as setup-test-project.ps1 / reset-test-project.ps1" {
  (Get-Content (Join-Path $PSScriptRoot "setup-test-project.ps1") -Raw).Contains('@("-X", "-w", "-q", "-v", "ON_ERROR_STOP=1", "-f", $sql)') -and
  (Get-Content (Join-Path $PSScriptRoot "reset-test-project.ps1") -Raw).Contains('$psqlArgs = @("-X", "-w", "-v", "ON_ERROR_STOP=1")')
}

$dir = Join-Path ([IO.Path]::GetTempPath()) ("sophia-t2-local-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
$data = Join-Path $dir "data"
$workdir = $null
$fakeEnvFile = $null
$started = $false
$password = -join ((48..57) + (65..90) + (97..122) + @(35, 37, 64, 33) | Get-Random -Count 28 | ForEach-Object { [char]$_ })
Add-Tier2Secret $password

function Start-Native([string]$File, [string[]]$ArgList) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $File
  $psi.Arguments = ($ArgList | ForEach-Object { if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ } }) -join " "
  $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
  $p = [System.Diagnostics.Process]::Start($psi); $p.WaitForExit(); return $p.ExitCode
}

function Conn([string]$Db) { [pscustomobject]@{ Host = "127.0.0.1"; Port = "$script:port"; User = "postgres"; Database = $Db; Password = $password } }
function PgEnv([string]$Db, [hashtable]$Extra = @{}) { $e = Get-Tier2PgEnvironment (Conn $Db); foreach ($k in $Extra.Keys) { $e[$k] = $Extra[$k] }; return $e }
function Psql([string]$Db, [string[]]$ArgList, [hashtable]$Extra = @{}) { Invoke-Tier2Process -FilePath (Join-Path $pgBin "psql.exe") -ArgumentList $ArgList -Environment (PgEnv $Db $Extra) }
function Sql([string]$Db, [string]$Statement) {
  $r = Psql $Db @("-X", "-w", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", $Statement)
  if ($r.Code -ne 0) { throw "SQL failed on ${Db}: $($r.Errors -join ' ')" }
  return ($r.Lines -join "`n").Trim()
}
function AsAdmin([string]$Statement) { "set role authenticated; select set_config('request.jwt.claim.sub', '$($users.admin)', false); $Statement; reset role;" }
function NewDb([string]$Name, [string]$Template = "t2tpl") { Sql "postgres" "create database $Name template $Template" | Out-Null }
function SetupEnv([string]$RefValue = $ref) {
  $e = @{ SOPHIA_T2_ADMIN_EMAIL = $emails.admin; SOPHIA_T2_MANAGER_EMAIL = $emails.manager; SOPHIA_T2_NOPROFILE_EMAIL = $emails.noprofile }
  if ($RefValue) { $e["SOPHIA_T2_REF"] = $RefValue }
  return $e
}
$SnapshotSql = @"
select string_agg(t || '=' || n || ':' || h, ' ' order by t) from (
  select 'team' t, count(*) n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from public.team_members x
  union all select 'events', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.events x
  union all select 'gallery', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.gallery_items x
  union all select 'faculty', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.faculty x
  union all select 'messages', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.hod_messages x
  union all select 'content', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.site_content x
  union all select 'audit', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.audit_log x
  union all select 'profiles', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.profiles x
  union all select 'objects', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from storage.objects x
) s
"@
function Snapshot([string]$Db) { Sql $Db $SnapshotSql }
function Text($r) { (($r.Lines + $r.Errors) -join "`n") }
# Samples the command line of every process created after now, in a background job, until Stop-CmdSampler.
function Start-CmdSampler {
  $flag = Join-Path $dir ("sampler-" + [Guid]::NewGuid().ToString("N") + ".ready")
  $job = Start-Job -ScriptBlock {
    param($since, $flag)
    New-Item -ItemType File -Path $flag | Out-Null
    # emit as it goes: a stopped job keeps what it has already written
    for ($i = 0; $i -lt 600; $i++) { Get-CimInstance Win32_Process | Where-Object { $_.CreationDate -ge $since } | ForEach-Object { "$($_.Name) $($_.CommandLine)" }; Start-Sleep -Milliseconds 150 }
  } -ArgumentList (Get-Date), $flag
  for ($i = 0; $i -lt 200 -and -not (Test-Path $flag); $i++) { Start-Sleep -Milliseconds 100 }
  return $job
}
function Stop-CmdSampler($Job) {
  Start-Sleep -Milliseconds 600
  Stop-Job $Job; $seen = @(Receive-Job $Job); Remove-Job $Job -Force
  return @($seen | Select-Object -Unique)
}
function Count($r, [string]$Step) {
  foreach ($line in $r.Lines) { if ($line -match ("^\s*" + [regex]::Escape($Step) + "\s*\|\s*(\d+)\s*$")) { return [int]$Matches[1] } }
  return -1
}

try {
  # ---------------------------------------------------------------- disposable cluster: TLS + SCRAM, loopback only
  New-Item -ItemType Directory -Path $dir | Out-Null
  $pwfile = Join-Path $dir "pw.txt"
  [IO.File]::WriteAllText($pwfile, $password)
  $code = Start-Native (Join-Path $pgBin "initdb.exe") @("-D", $data, "-U", "postgres", "--pwfile=$pwfile", "--auth-local=scram-sha-256", "--auth-host=scram-sha-256", "--encoding=UTF8", "--locale=C", "--no-instructions")
  Remove-Item $pwfile -Force
  if ($code -ne 0) { throw "initdb failed ($code)" }
  $code = Start-Native $openssl @("req", "-new", "-x509", "-days", "1", "-nodes", "-subj", "/CN=localhost", "-keyout", (Join-Path $data "server.key"), "-out", (Join-Path $data "server.crt"))
  if ($code -ne 0) { throw "openssl failed ($code)" }
  [IO.File]::WriteAllText((Join-Path $data "pg_hba.conf"), "hostssl all all 127.0.0.1/32 scram-sha-256`n")   # TLS required, no trust
  $listener = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0); $listener.Start(); $script:port = $listener.LocalEndpoint.Port; $listener.Stop()
  $code = Start-Native (Join-Path $pgBin "pg_ctl.exe") @("-D", $data, "-l", (Join-Path $dir "server.log"), "-w", "-t", "60", "-o",
    "-p $script:port -c listen_addresses=127.0.0.1 -c ssl=on -c fsync=off -c synchronous_commit=off -c max_connections=40", "start")
  if ($code -ne 0) { throw "pg_ctl start failed ($code)" }
  $started = $true
  Write-Host "Disposable cluster on 127.0.0.1:$script:port (TLS + SCRAM) in $dir"

  # ---------------------------------------------------------------- template: stand-in + 9 migrations + 3 users
  Sql "postgres" "create database t2tpl" | Out-Null
  $r = Psql "t2tpl" @("-X", "-w", "-q", "-v", "ON_ERROR_STOP=1", "-f", (Join-Path $script:Tier2Root "tests\integration\db\supabase-shim.sql"))
  if ($r.Code -ne 0) { throw "shim failed: $(Text $r)" }
  $migrations = @(Get-ChildItem (Join-Path $script:Tier2Root "supabase\migrations") -Filter *.sql | Sort-Object Name)
  foreach ($m in $migrations) {
    $r = Psql "t2tpl" @("-X", "-w", "-q", "-v", "ON_ERROR_STOP=1", "-f", $m.FullName)
    if ($r.Code -ne 0) { throw "migration $($m.Name) failed: $(Text $r)" }
  }
  Sql "t2tpl" ("insert into auth.users (id, email) values ('{0}', '{1}'), ('{2}', '{3}'), ('{4}', '{5}')" -f $users.admin, $emails.admin, $users.manager, $emails.manager, $users.noprofile, $emails.noprofile) | Out-Null
  Check "the nine migrations apply on the local cluster" { $migrations.Count -eq 9 -and (Sql "t2tpl" "select count(*) from pg_policies where schemaname in ('public','storage')") -eq "33" }

  # ---------------------------------------------------------------- PGPASSWORD / TLS behaviour of psql
  Check "psql connects with the password from PGPASSWORD (child environment only), over TLS" { (Sql "postgres" "select ssl from pg_stat_ssl where pid = pg_backend_pid()") -eq "t" }
  Check "a wrong PGPASSWORD is refused without any prompt (psql -w, closed stdin)" {
    $e = PgEnv "postgres"; $e["PGPASSWORD"] = "definitely-wrong"
    $r = Invoke-Tier2Process -FilePath (Join-Path $pgBin "psql.exe") -ArgumentList @("-X", "-w", "-c", "select 1") -Environment $e
    $r.Code -ne 0 -and (Text $r) -match "password authentication failed"
  }
  Check "without PGPASSWORD psql fails instead of prompting" {
    $e = PgEnv "postgres"; $e.Remove("PGPASSWORD")
    $r = Invoke-Tier2Process -FilePath (Join-Path $pgBin "psql.exe") -ArgumentList @("-X", "-w", "-c", "select 1") -Environment $e
    $r.Code -ne 0
  }
  Check "a non-TLS connection is rejected by the cluster (TLS is really enforced)" {
    $e = PgEnv "postgres"; $e["PGSSLMODE"] = "disable"
    $r = Invoke-Tier2Process -FilePath (Join-Path $pgBin "psql.exe") -ArgumentList @("-X", "-w", "-c", "select 1") -Environment $e
    $r.Code -ne 0 -and (Text $r) -match "no pg_hba.conf entry"
  }
  Check "the password never appears in any process command line while psql runs" {
    $job = Start-CmdSampler
    $r = Psql "postgres" @("-X", "-w", "-q", "-c", "select pg_sleep(3)")
    $seen = Stop-CmdSampler $job
    $psqlSeen = @($seen | Where-Object { $_ -like "psql.exe*" })
    Write-Host "  sampled psql command line: $(Protect-Tier2Text ($psqlSeen | Select-Object -First 1))"
    $r.Code -eq 0 -and $psqlSeen.Count -gt 0 -and -not (($seen -join "`n").Contains($password))
  }

  # ---------------------------------------------------------------- setup-test-project.sql
  NewDb "s1"
  $r = Psql "s1" $SetupArgs (SetupEnv)
  Check "setup succeeds through \getenv values (exit 0)" { $r.Code -eq 0 }
  Check "setup created the admin and manager profiles with the right roles, and none for the no-profile user" {
    (Sql "s1" "select string_agg(u.email || ':' || p.role, ',' order by u.email) from public.profiles p join auth.users u on u.id = p.user_id") -eq "$($emails.admin):admin,$($emails.manager):manager"
  }
  Check "setup created the marker with the connected ref" {
    (Sql "s1" "select data->>'project' || '/' || (data->>'ref') from public.site_content where id = 'meta.integration'") -eq "sophia-cms-integration/$ref"
  }
  Check "setup output shows the profiles and the marker, and no password" { $t = Text $r; $t -match "marker" -and $t.Contains($ref) -and -not $t.Contains($password) }
  $afterSetup = Snapshot "s1"
  $r = Psql "s1" $SetupArgs (SetupEnv)
  Check "setup refuses a second run and changes nothing" { $r.Code -ne 0 -and (Text $r) -match "Already set up" -and (Snapshot "s1") -eq $afterSetup }

  $setupRefusals = @(
    @{ Name = "missing SOPHIA_T2_REF (\if :{?connected_ref})"; Env = (SetupEnv ""); Expect = "no verified connection ref"; Prepare = $null },
    @{ Name = "missing an email"; Env = @{ SOPHIA_T2_REF = $ref; SOPHIA_T2_ADMIN_EMAIL = $emails.admin; SOPHIA_T2_MANAGER_EMAIL = $emails.manager }; Expect = "emails missing"; Prepare = $null },
    @{ Name = "the staging ref"; Env = (SetupEnv "mqvhuvtakzrnvuvkkgyt"); Expect = "staging or production"; Prepare = $null },
    @{ Name = "the production ref"; Env = (SetupEnv "mcbsxthyjmptrgfppbsa"); Expect = "staging or production"; Prepare = $null },
    @{ Name = "a malformed ref"; Env = (SetupEnv "Not-A-Ref"); Expect = "invalid connected project ref"; Prepare = $null },
    @{ Name = "a database that already holds CMS records"; Env = (SetupEnv); Expect = "already contains CMS records"; Prepare = "insert into public.events (id, name, event_date, venue, status, description, poster) values ('real-event', 'Real', '2026-01-01', 'Hall', 'completed', 'x', '/images/p.png')" },
    @{ Name = "a missing test user"; Env = (SetupEnv); Expect = "Create the three test users first"; Prepare = "delete from auth.users where email = '$($emails.manager)'" },
    @{ Name = "an existing profile with an unexpected role (L3)"; Env = (SetupEnv); Expect = "already has the role manager, expected admin"; Prepare = "insert into public.profiles (user_id, display_name, role) values ('$($users.admin)', 'X', 'manager')" },
    @{ Name = "a no-profile user that has a profile"; Env = (SetupEnv); Expect = "must not have a profile"; Prepare = "insert into public.profiles (user_id, display_name, role) values ('$($users.noprofile)', 'X', 'manager')" }
  )
  $i = 0
  foreach ($case in $setupRefusals) {
    $i++; $db = "sr$i"; NewDb $db
    if ($case.Prepare) { Sql $db $case.Prepare | Out-Null }
    $snap = Snapshot $db
    $r = Psql $db $SetupArgs $case.Env
    Check "setup refuses $($case.Name), changing nothing" { $r.Code -ne 0 -and (Text $r) -match [regex]::Escape($case.Expect) -and (Snapshot $db) -eq $snap }
  }
  Sql "postgres" "create database nomig" | Out-Null
  Psql "nomig" @("-X", "-w", "-q", "-v", "ON_ERROR_STOP=1", "-f", (Join-Path $script:Tier2Root "tests\integration\db\supabase-shim.sql")) | Out-Null
  $r = Psql "nomig" $SetupArgs (SetupEnv)
  Check "setup refuses a database without the CMS migrations" { $r.Code -ne 0 -and (Text $r) -match "migrations are not applied" }

  # ---------------------------------------------------------------- reset.sql seed: owned, foreign and mixed records
  Sql "s1" (AsAdmin @"
insert into public.team_members (id, name, role, category, sort_order) values ('$RUN-member', 'IT Member', 'Member', 'Technical Team', 1), ('regular-member', 'Regular', 'Member', 'Technical Team', 2);
insert into public.events (id, name, event_date, venue, status, description, poster) values ('$RUN-event', 'IT Event', '2026-03-01', 'Hall', 'completed', 'x', '/images/p.png'), ('$RUN-mixed', 'Mixed', '2026-03-02', 'Hall', 'completed', 'x', '/images/p.png');
insert into public.gallery_items (id, title, category, event, year, url) values ('$RUN-photo', 'IT Photo', 'photo', 'IT', 2026, '/images/a.jpg');
insert into public.faculty (id, name, designation, sort_order, is_published) values ('$RUN-hod', 'Dr IT', 'Professor', 1, true), ('$RUN-hist', 'Dr Hist', 'Professor', 2, true);
select public.set_active_hod('$RUN-hod');
insert into public.hod_messages (faculty_id, message, status, approved_by, approved_on) values ('$RUN-hod', 'Hello', 'published', 'HOD', '2026-11-01');
insert into public.hod_messages (faculty_id, message) values ('$RUN-hist', 'Owned draft');
insert into public.site_content (id, data) values ('home.cta', '{"t":"tier2"}'), ('about.stats', '{"t":"tier2"}')
"@) | Out-Null
  Sql "s1" @"
insert into public.team_members (id, name, role, category, sort_order) values ('$RUN-foreign', 'Owner made', 'Member', 'Technical Team', 3);
update public.events set venue = 'Owner edit' where id = '$RUN-mixed';
insert into public.site_content (id, data) values ('home.hero', '{"t":"owner"}');
update public.site_content set data = '{"t":"owner edit"}' where id = 'about.stats';
insert into public.hod_messages (faculty_id, message) values ('$RUN-hist', 'Owner draft');
insert into storage.objects (bucket_id, name) values ('site-media', 'events/$RUN-event/00000000-0000-4000-8000-000000000001.png'), ('site-media', 'events/regular-event/00000000-0000-4000-8000-000000000002.png')
"@ | Out-Null

  # ---------------------------------------------------------------- reset.sql PREVIEW
  $snap = Snapshot "s1"
  $r = Psql "s1" ($ResetBase + @("-f", $resetSql)) @{ SOPHIA_T2_REF = $ref; SOPHIA_T2_ADMIN_EMAIL = $emails.admin }
  $t = Text $r
  Check "reset preview runs (exit 0) and says PREVIEW ONLY" { $r.Code -eq 0 -and $t -match "PREVIEW ONLY" -and $t -notmatch "APPLIED" }
  Check "preview plans exactly the owned run records: 2 messages, 1 HOD flag, 1 faculty, 1 team, 1 event, 1 gallery item, 1 content row" {
    (Count $r "1 hod_messages") -eq 2 -and (Count $r "2 HOD flag cleared (removed records only)") -eq 1 -and (Count $r "3 faculty") -eq 1 -and
    (Count $r "4 team_members") -eq 1 -and (Count $r "5 events") -eq 1 -and (Count $r "6 gallery_items") -eq 1 -and (Count $r "7 site_content") -eq 1 -and
    (Count $r "8 audit_log (removed records only)") -gt 0
  }
  Check "preview keeps the 3 run-pattern records with foreign or mixed history (owner-made team, owner-edited event, faculty with a foreign message)" { $t -match "mixed or foreign history\s*\|\s*3" }
  Check "preview lists only the run-pattern storage object" { $t.Contains("events/$RUN-event/") -and -not $t.Contains("events/regular-event/") }
  Check "preview rolled back: every table (records, audit, profiles, storage) is byte-identical" { (Snapshot "s1") -eq $snap }
  Check "the run's HOD is still active after the preview" { (Sql "s1" "select id from public.faculty where is_active_hod") -eq "$RUN-hod" }

  # ---------------------------------------------------------------- reset.sql refusals (each must change nothing)
  NewDb "s1nomarker" "s1"
  Sql "s1nomarker" "delete from public.site_content where id = 'meta.integration'" | Out-Null
  $resetRefusals = @(
    @{ Name = "missing SOPHIA_T2_REF"; Db = "s1"; Env = @{ SOPHIA_T2_ADMIN_EMAIL = $emails.admin }; Extra = @(); Expect = "no verified connection ref" },
    @{ Name = "missing admin email"; Db = "s1"; Env = @{ SOPHIA_T2_REF = $ref }; Extra = @(); Expect = "admin email missing" },
    @{ Name = "a wrong (other valid) ref: no marker for it"; Db = "s1"; Env = @{ SOPHIA_T2_REF = "otherprojectref00001"; SOPHIA_T2_ADMIN_EMAIL = $emails.admin }; Extra = @(); Expect = "no Tier 2 marker for the connected project" },
    @{ Name = "the staging ref"; Db = "s1"; Env = @{ SOPHIA_T2_REF = "mqvhuvtakzrnvuvkkgyt"; SOPHIA_T2_ADMIN_EMAIL = $emails.admin }; Extra = @(); Expect = "staging or production" },
    @{ Name = "the production ref"; Db = "s1"; Env = @{ SOPHIA_T2_REF = "mcbsxthyjmptrgfppbsa"; SOPHIA_T2_ADMIN_EMAIL = $emails.admin }; Extra = @(); Expect = "staging or production" },
    @{ Name = "a missing marker"; Db = "s1nomarker"; Env = @{ SOPHIA_T2_REF = $ref; SOPHIA_T2_ADMIN_EMAIL = $emails.admin }; Extra = @(); Expect = "no Tier 2 marker" },
    @{ Name = "an 'admin' email that is not an admin (ownership identity mismatch)"; Db = "s1"; Env = @{ SOPHIA_T2_REF = $ref; SOPHIA_T2_ADMIN_EMAIL = $emails.manager }; Extra = @(); Expect = "is not an admin here" },
    @{ Name = "apply=2 (\gset + \if path)"; Db = "s1"; Env = @{ SOPHIA_T2_REF = $ref; SOPHIA_T2_ADMIN_EMAIL = $emails.admin }; Extra = @("-v", "apply=2"); Expect = "apply must be exactly 1" },
    @{ Name = "apply=yes"; Db = "s1"; Env = @{ SOPHIA_T2_REF = $ref; SOPHIA_T2_ADMIN_EMAIL = $emails.admin }; Extra = @("-v", "apply=yes"); Expect = "apply must be exactly 1" },
    @{ Name = "an empty apply"; Db = "s1"; Env = @{ SOPHIA_T2_REF = $ref; SOPHIA_T2_ADMIN_EMAIL = $emails.admin }; Extra = @("-v", "apply="); Expect = "apply must be exactly 1" }
  )
  foreach ($case in $resetRefusals) {
    $snap = Snapshot $case.Db
    $r = Psql $case.Db ($ResetBase + $case.Extra + @("-f", $resetSql)) $case.Env
    Check "reset refuses $($case.Name), changing nothing" { $r.Code -ne 0 -and (Text $r) -match [regex]::Escape($case.Expect) -and (Snapshot $case.Db) -eq $snap }
  }

  # the apply=1 branch is NOT run (that would commit); its \gset/\if logic is checked in isolation with an identical block
  $probe = Join-Path $dir "apply-probe.sql"
  $block = (Get-Content $resetSql -Raw) -replace "(?s)^.*?(\\if :\{\?apply\}.*?\\endif\r?\n\\endif)\r?\n.*$", '$1'
  [IO.File]::WriteAllText($probe, "\set ON_ERROR_STOP on`n$block`n\if :{?tier2_commit}`n\echo DECISION=COMMIT`n\else`n\echo DECISION=ROLLBACK`n\endif`n")
  Check "reset.sql's apply block is the one probed" { $block.StartsWith("\if :{?apply}") -and $block.Contains("\gset") -and $block.Contains("\set tier2_commit 1") }
  Check "apply block: no apply → ROLLBACK" { (Text (Psql "postgres" @("-X", "-w", "-f", $probe))) -match "DECISION=ROLLBACK" }
  Check "apply block: apply=1 → COMMIT (probe only; reset itself was never run with apply=1)" { (Text (Psql "postgres" @("-X", "-w", "-v", "apply=1", "-f", $probe))) -match "DECISION=COMMIT" }

  # ---------------------------------------------------------------- Read-Tier2VerifiedConnection identity logic (prompts and node mocked)
  $pooler = { param($r) "postgresql://postgres.$r" + ":" + [Uri]::EscapeDataString($password) + "@aws-0-ap-south-1.pooler.supabase.com:5432/postgres" }
  $realNode = ${function:script:Invoke-Tier2Node}
  function Invoke-Verify([string]$Typed, [string]$ConnString, [string[]]$Allowed, [string]$EnvRef) {
    $global:t2answers = New-Object System.Collections.Queue
    $global:t2answers.Enqueue($Typed); $global:t2answers.Enqueue((ConvertTo-SecureString $ConnString -AsPlainText -Force))
    function global:Read-Host { param([string]$Prompt, [switch]$AsSecureString) $global:t2answers.Dequeue() }
    # replaces the dot-sourced function in the script scope (where Read-Tier2VerifiedConnection resolves it)
    $global:t2allowed = $Allowed; $global:t2envref = $EnvRef
    ${function:script:Invoke-Tier2Node} = {
      param([string[]]$NodeArgs)
      if ($NodeArgs[0] -eq "allowlist") { return [pscustomobject]@{ allowed = $global:t2allowed; denied = @("mqvhuvtakzrnvuvkkgyt", "mcbsxthyjmptrgfppbsa") } }
      return [pscustomobject]@{ ref = $global:t2envref; adminEmail = "a"; managerEmail = "m"; noProfileEmail = "n" }
    }
    try { return Read-Tier2VerifiedConnection }
    finally {
      Remove-Item Function:\global:Read-Host -ErrorAction SilentlyContinue
      ${function:script:Invoke-Tier2Node} = $realNode
      Remove-Variable t2answers, t2allowed, t2envref -Scope Global -ErrorAction SilentlyContinue
    }
  }
  $fake = "abcdefghijklmnopqrst"
  Check "identity: connection ref = typed ref = env ref = allowlisted → accepted" { $v = Invoke-Verify $fake (& $pooler $fake) @($fake) $fake; $v.Connection.Ref -eq $fake }
  Check "identity: typed ref differs from the env ref → refused" { try { Invoke-Verify "zzzzzzzzzzzzzzzzzzzz" (& $pooler $fake) @($fake, "zzzzzzzzzzzzzzzzzzzz") $fake; $false } catch { $_.Exception.Message -match "not the ref of INTEGRATION_SUPABASE_URL" } }
  Check "identity: connection string for another (allowlisted) project → refused" { try { Invoke-Verify $fake (& $pooler "zzzzzzzzzzzzzzzzzzzz") @($fake, "zzzzzzzzzzzzzzzzzzzz") $fake; $false } catch { $_.Exception.Message -match "connects to zzzzzzzzzzzzzzzzzzzz" } }
  Check "identity: staging connection string → refused" { try { Invoke-Verify $fake (& $pooler "mqvhuvtakzrnvuvkkgyt") @($fake) $fake; $false } catch { $_.Exception.Message -match "staging" } }
  Check "identity: not allowlisted → refused" { try { Invoke-Verify $fake (& $pooler $fake) @() $fake; $false } catch { $_.Exception.Message -match "not in ALLOWED_TEST_REFS" } }
  Check "identity: a local/non-Supabase connection string (like this cluster) → refused" { try { Invoke-Verify $fake "postgresql://postgres:x@127.0.0.1:$script:port/postgres" @($fake) $fake; $false } catch { $_.Exception.Message -match "identify a project" } }

  # ---------------------------------------------------------------- real wrapper entry, refusing on the real (empty) allowlist
  $fakeEnvFile = Join-Path $script:Tier2Root ".env.integration.local"
  if (Test-Path $fakeEnvFile) { $fakeEnvFile = $null; $script:notes += "skipped the real-entry check: a .env.integration.local already exists (left untouched)" }
  else {
    [IO.File]::WriteAllText($fakeEnvFile, (@("INTEGRATION_SUPABASE_URL=https://$fake.supabase.co", "INTEGRATION_SUPABASE_PUBLISHABLE_KEY=sb_publishable_localonly",
      "INTEGRATION_ADMIN_EMAIL=a@local.test", "INTEGRATION_ADMIN_PASSWORD=local-admin-pw-1", "INTEGRATION_MANAGER_EMAIL=m@local.test", "INTEGRATION_MANAGER_PASSWORD=local-manager-pw-1",
      "INTEGRATION_NOPROFILE_EMAIL=n@local.test", "INTEGRATION_NOPROFILE_PASSWORD=local-noprofile-pw-1") -join "`n"))
    foreach ($wrapper in @("setup-test-project.ps1", "reset-test-project.ps1", "push-migrations.ps1")) {
      $r = Invoke-Tier2Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot $wrapper)) -Environment @{}
      Check "$wrapper refuses before any prompt or connection: the real allowlist is empty" { $r.Code -ne 0 -and (Text $r) -match "no test project is allowlisted yet" }
    }
  }

  # ---------------------------------------------------------------- Supabase CLI dry run with PGPASSWORD (no password in --db-url)
  if ($SkipCli) { $script:notes += "CLI checks skipped (-SkipCli)" }
  else {
    Sql "postgres" "create database clidry" | Out-Null
    Psql "clidry" @("-X", "-w", "-q", "-v", "ON_ERROR_STOP=1", "-f", (Join-Path $script:Tier2Root "tests\integration\db\supabase-shim.sql")) | Out-Null
    $workdir = Join-Path ([IO.Path]::GetTempPath()) ("sophia-push-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
    New-Item -ItemType Directory -Path (Join-Path $workdir "supabase\migrations") | Out-Null
    Copy-Item (Join-Path $script:Tier2Root "supabase\migrations\*.sql") (Join-Path $workdir "supabase\migrations")
    Copy-Item (Join-Path $script:Tier2Root "supabase\config.toml") (Join-Path $workdir "supabase")
    $npx = (Get-Command npx.cmd).Source
    $dbUrl = "postgresql://postgres@127.0.0.1:$script:port/clidry?sslmode=require"   # same shape as push-migrations.ps1: no password
    $job = Start-CmdSampler
    $dry = Invoke-Tier2Process -FilePath $npx -ArgumentList @("--yes", "supabase@2.122.0", "db", "push", "--db-url", $dbUrl, "--workdir", $workdir, "--dry-run") -Environment @{ PGPASSWORD = $password; PGSSLMODE = "require" }
    $seen = Stop-CmdSampler $job
    $dt = Text $dry
    Write-Host "  CLI dry-run output (redacted):"; ($dry.Lines + $dry.Errors) | ForEach-Object { Write-Host "    $_" }
    Check "Supabase CLI 2.122.0 dry run authenticates with PGPASSWORD (password not in --db-url)" { $dry.Code -eq 0 }
    Check "the dry run lists all nine migrations" { @($migrations | Where-Object { -not $dt.Contains($_.Name) }).Count -eq 0 }
    Check "the dry run applied nothing" { (Sql "clidry" "select count(*) from pg_tables where schemaname = 'public'") -eq "0" }
    $pushSeen = @($seen | Where-Object { $_ -match "db push" })
    $pushSeen | Select-Object -First 3 | ForEach-Object { Write-Host "  sampled: $(Protect-Tier2Text $_)" }
    Check "no process command line (npx, node, supabase) contained the password during the CLI run" { $pushSeen.Count -gt 0 -and -not (($seen -join "`n").Contains($password)) }
    Check "CLI output contained no password" { -not $dt.Contains($password) }
    $nopw = Invoke-Tier2Process -FilePath $npx -ArgumentList @("--yes", "supabase@2.122.0", "db", "push", "--db-url", $dbUrl, "--workdir", $workdir, "--dry-run") -Environment @{ PGSSLMODE = "require" }
    Check "without PGPASSWORD the CLI dry run fails (so PGPASSWORD is what authenticated it)" { $nopw.Code -ne 0 }
  }
}
catch {
  $script:failed++
  Write-Host "ERROR $(Protect-Tier2Text $_.Exception.Message)" -ForegroundColor Red
}
finally {
  if ($started) { Start-Native (Join-Path $pgBin "pg_ctl.exe") @("-D", $data, "-m", "fast", "-w", "-t", "60", "stop") | Out-Null }
  if ($fakeEnvFile -and (Test-Path $fakeEnvFile)) { Remove-Item $fakeEnvFile -Force }
  if ($workdir -and (Test-Path $workdir)) { Remove-Item -Recurse -Force $workdir }
  for ($i = 0; $i -lt 10 -and (Test-Path $dir); $i++) { try { Remove-Item -Recurse -Force $dir } catch { Start-Sleep -Milliseconds 500 } }
  $leftProcs = @(Get-CimInstance Win32_Process -Filter "Name='postgres.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($dir) }).Count
  Write-Host ""
  Write-Host "Cleanup: cluster folder removed: $(-not (Test-Path $dir)); cluster processes left: $leftProcs; temp env file removed: $(-not ($fakeEnvFile -and (Test-Path $fakeEnvFile))); CLI workdir removed: $(-not ($workdir -and (Test-Path $workdir)))"
  foreach ($n in $script:notes) { Write-Host "NOTE  $n" }
  Write-Host "$script:passed passed, $script:failed failed"
  Clear-Tier2Secrets
}
if ($script:failed -gt 0) { exit 1 }

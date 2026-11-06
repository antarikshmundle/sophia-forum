# Shared helpers for the Tier 2 PowerShell scripts (Windows PowerShell 5.1). Dot-source it; it runs nothing itself.
#
# Identity: a database connection is accepted only when the project ref in the connection's OWN routing data (the
# pooler user postgres.<ref>, or the direct host db.<ref>.supabase.co) equals the ref you type, the ref of
# INTEGRATION_SUPABASE_URL in .env.integration.local and an allowlisted test ref (tests/integration/supabase/
# allowlist.mjs, read by node, never by matching its text); staging and production are always denied. The login with
# that project's database password over TLS (sslmode=require) then proves the connection reaches that project.
# Secrets: the password is passed only in the child process's environment (PGPASSWORD), never as an argument; every
# line of child output is redacted before it is shown.

$script:Tier2Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$script:Tier2Denied = @{ "mqvhuvtakzrnvuvkkgyt" = "sophia-cms-staging"; "mcbsxthyjmptrgfppbsa" = "production" }
$script:Tier2Secrets = New-Object System.Collections.Generic.List[string]

function Protect-Tier2Text([string]$Text) {
  if ($null -eq $Text) { return "" }
  foreach ($secret in ($script:Tier2Secrets | Sort-Object Length -Descending)) {
    if ($secret) { $Text = $Text.Replace($secret, "[redacted]") }
  }
  $Text = $Text -replace "postgres(ql)?://[^\s'""]+", "[redacted-connection-string]"
  $Text = $Text -replace "(?i)\b(PGPASSWORD|password|passwd|pwd)(\s*[=:]\s*)(""[^""]*""|'[^']*'|[^\s;&,]+)", '$1$2[redacted]'
  return $Text
}

function Add-Tier2Secret([string]$Value) {
  if (-not $Value) { return }
  foreach ($form in @($Value, [Uri]::EscapeDataString($Value), [Uri]::UnescapeDataString($Value))) {
    if ($form -and -not $script:Tier2Secrets.Contains($form)) { $script:Tier2Secrets.Add($form) }
  }
}

function Clear-Tier2Secrets { $script:Tier2Secrets.Clear() }

function Assert-Tier2CleanShell {
  foreach ($name in @(Get-ChildItem Env: | ForEach-Object { $_.Name })) {
    if ($name -match "^(PG(HOST|HOSTADDR|PORT|USER|PASSWORD|DATABASE|SERVICE|SERVICEFILE|PASSFILE|SSLMODE)|SUPABASE_(DB_URL|TEST_DB_URL|DB_PASSWORD|SERVICE_ROLE_KEY|SECRET_KEY)|DATABASE_URL)$") {
      throw "REFUSED: remove the shell variable $name first."
    }
  }
}

function Invoke-Tier2Node([string[]]$NodeArgs) {
  $node = (Get-Command node -ErrorAction Stop).Source
  $result = Invoke-Tier2Process -FilePath $node -ArgumentList (@((Join-Path $script:Tier2Root "tests\integration\supabase\tier2-cli.mjs")) + $NodeArgs) -Environment @{}
  if ($result.Code -ne 0) { throw (($result.Errors + $result.Lines) -join " ") }   # tier2-cli's messages start with REFUSED:
  return (($result.Lines -join "") | ConvertFrom-Json)
}

function Get-Tier2Allowlist {
  $list = Invoke-Tier2Node @("allowlist")
  $denied = @($list.denied) + @($script:Tier2Denied.Keys) | Select-Object -Unique
  return @{ Allowed = @($list.allowed); Denied = $denied }
}

function Assert-Tier2Ref([string]$Ref, $Allowlist, [string]$Source) {
  if ($Ref -notmatch "^[a-z0-9]{20}$") { throw "REFUSED: $Source is not a project ref." }
  if ($Allowlist.Denied -contains $Ref) {
    $label = $script:Tier2Denied[$Ref]; if (-not $label) { $label = "a denied project" }
    throw "REFUSED: $Source is $label ($Ref)."
  }
  if ($Allowlist.Allowed -notcontains $Ref) { throw "REFUSED: $Source ($Ref) is not in ALLOWED_TEST_REFS." }
}

# Parses a Supabase session-pooler (port 5432) or direct connection string. Throws without echoing any part of it.
function ConvertFrom-Tier2ConnectionString([string]$ConnectionString) {
  $s = $ConnectionString.Trim()
  $m = [regex]::Match($s, "^postgres(?:ql)?://(?<user>[^:@/\s]+):(?<pw>[^@\s]+)@(?<host>[a-z0-9.-]+):(?<port>[0-9]+)/(?<db>[a-z0-9_]+)(?:\?[^\s]*)?$")
  if (-not $m.Success) { throw "REFUSED: not a postgresql://user:password@host:port/database connection string." }
  $user = $m.Groups["user"].Value; $hostName = $m.Groups["host"].Value
  $port = $m.Groups["port"].Value; $db = $m.Groups["db"].Value
  $ref = $null; $kind = $null
  # [regex]::Match keeps each capture separate ($Matches would be overwritten by a second -match)
  $poolerUser = [regex]::Match($user, "^postgres\.([a-z0-9]{20})$")
  $directHost = [regex]::Match($hostName, "^db\.([a-z0-9]{20})\.supabase\.co$")
  if ($poolerUser.Success -and $hostName -match "^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$") { $ref = $poolerUser.Groups[1].Value; $kind = "session-pooler" }
  elseif ($user -eq "postgres" -and $directHost.Success) { $ref = $directHost.Groups[1].Value; $kind = "direct" }
  if (-not $ref) { throw "REFUSED: not a Supabase session-pooler or direct connection (user/host don't identify a project)." }
  if ($port -ne "5432") { throw "REFUSED: use port 5432 (session pooler or direct), not $port." }
  if ($db -ne "postgres") { throw "REFUSED: the database must be 'postgres'." }
  $password = [Uri]::UnescapeDataString($m.Groups["pw"].Value)
  if (-not $password) { throw "REFUSED: the connection string has no password." }
  return [pscustomobject]@{ Ref = $ref; Kind = $kind; Host = $hostName; Port = $port; User = $user; Database = $db; Password = $password; Raw = $s; EncodedPassword = $m.Groups["pw"].Value }
}

# Runs a program with a child-only environment: inherited PG*/SUPABASE_*/DATABASE_URL variables are removed and the
# given ones added. Output (stdout + stderr) is redacted line by line.
function Invoke-Tier2Process([string]$FilePath, [string[]]$ArgumentList, [hashtable]$Environment) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $FilePath
  $psi.Arguments = ($ArgumentList | ForEach-Object { if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ } }) -join " "
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.RedirectStandardInput = $true   # closed below: a child can never sit waiting at a password prompt
  $psi.CreateNoWindow = $true
  foreach ($key in @($psi.EnvironmentVariables.Keys)) {
    if ($key -match "^(PG|SUPABASE_)" -or $key -eq "DATABASE_URL") { $psi.EnvironmentVariables.Remove($key) }
  }
  foreach ($key in $Environment.Keys) { $psi.EnvironmentVariables[$key] = [string]$Environment[$key] }
  $p = [System.Diagnostics.Process]::Start($psi)
  $p.StandardInput.Close()
  $out = $p.StandardOutput.ReadToEndAsync()
  $err = $p.StandardError.ReadToEndAsync()
  $p.WaitForExit()
  $split = { param($t) @($t -split "`r?`n" | Where-Object { $_ -ne "" } | ForEach-Object { Protect-Tier2Text $_ }) }
  return @{ Code = $p.ExitCode; Lines = (& $split $out.Result); Errors = (& $split $err.Result) }
}

# Prompts for the ref and the connection string, and returns the verified connection plus the env-file summary.
function Read-Tier2VerifiedConnection {
  Assert-Tier2CleanShell
  $allowlist = Get-Tier2Allowlist
  $summary = Invoke-Tier2Node @("env-summary")          # full .env.integration.local validation (allowlist included)
  Assert-Tier2Ref $summary.ref $allowlist "INTEGRATION_SUPABASE_URL"

  $typed = (Read-Host "Test project ref (Project Settings -> General)").Trim()
  Assert-Tier2Ref $typed $allowlist "the ref you typed"
  if ($typed -ne $summary.ref) { throw "REFUSED: the ref you typed is not the ref of INTEGRATION_SUPABASE_URL." }

  $secure = Read-Host "Test project connection string (Connect -> Session pooler; input hidden)" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $raw = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  Add-Tier2Secret $raw.Trim()
  $conn = ConvertFrom-Tier2ConnectionString $raw
  Add-Tier2Secret $conn.Password
  Add-Tier2Secret $conn.EncodedPassword
  foreach ($bad in $script:Tier2Denied.Keys) { if ($conn.Raw.Contains($bad)) { throw "REFUSED: the connection string mentions $($script:Tier2Denied[$bad])." } }
  Assert-Tier2Ref $conn.Ref $allowlist "the connection string's project"
  if ($conn.Ref -ne $typed) { throw "REFUSED: the connection string connects to $($conn.Ref), not $typed." }
  Write-Host "Verified: connection ($($conn.Kind)), typed ref, .env.integration.local and allowlist all name $($conn.Ref)."
  return @{ Connection = $conn; Summary = $summary }
}

function Get-Tier2PsqlPath {
  $bin = $env:SOPHIA_PG_BIN; if (-not $bin) { $bin = "D:\PostgreSQL\bin" }
  $psql = Join-Path $bin "psql.exe"
  if (-not (Test-Path $psql)) { throw "psql not found at $psql (set SOPHIA_PG_BIN)." }
  return $psql
}

# libpq settings for the child only: the password never appears in an argument.
function Get-Tier2PgEnvironment($Conn) {
  return @{
    PGHOST = $Conn.Host; PGPORT = $Conn.Port; PGUSER = $Conn.User; PGDATABASE = $Conn.Database
    PGPASSWORD = $Conn.Password; PGSSLMODE = "require"; PGCONNECT_TIMEOUT = "20"; PGAPPNAME = "sophia-tier2"
  }
}

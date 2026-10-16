param([Parameter(Mandatory=$true)][string[]]$Addresses, [string]$OpenSSL)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$tlsDir = Join-Path $projectRoot 'data/tls'
if (-not $OpenSSL) {
    $gitCommand = (Get-Command git.exe).Source
    $OpenSSL = Join-Path (Split-Path (Split-Path $gitCommand -Parent) -Parent) 'mingw64/bin/openssl.exe'
}
if (-not (Test-Path -LiteralPath $OpenSSL)) { throw 'Pass -OpenSSL with the path to openssl.exe' }
foreach ($address in $Addresses) { [void][System.Net.IPAddress]::Parse($address) }
New-Item -ItemType Directory -Force -Path $tlsDir | Out-Null
$account = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe (Join-Path $projectRoot 'data') /inheritance:r /grant:r "${account}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict data directory permissions' }
Push-Location $tlsDir
try {
    if (-not (Test-Path -LiteralPath 'ca.crt')) {
        & $OpenSSL req -x509 -newkey rsa:3072 -nodes -keyout ca-key.pem -out ca.crt -days 365 -subj '/CN=TCompanion Local Development CA' -addext 'basicConstraints=critical,CA:TRUE' -addext 'keyUsage=critical,keyCertSign,cRLSign' 2>ca-generation.log
        if ($LASTEXITCODE -ne 0) { throw 'CA generation failed' }
    }
    $names = @('DNS:localhost','IP:127.0.0.1') + @($Addresses | ForEach-Object { 'IP:' + $_ })
    Set-Content -LiteralPath 'server.ext' -Encoding ascii -Value @('basicConstraints=critical,CA:FALSE','keyUsage=critical,digitalSignature,keyEncipherment','extendedKeyUsage=serverAuth',('subjectAltName='+($names -join ',')))
    & $OpenSSL req -new -newkey rsa:2048 -nodes -keyout server-key.pem -out server.csr -subj '/CN=TCompanion Local Backend' 2>server-generation.log
    if ($LASTEXITCODE -ne 0) { throw 'Server key generation failed' }
    & $OpenSSL x509 -req -in server.csr -CA ca.crt -CAkey ca-key.pem -CAcreateserial -out server.crt -days 90 -sha256 -extfile server.ext
    if ($LASTEXITCODE -ne 0) { throw 'Server certificate generation failed' }
    Write-Output ('Android trial: install only the public CA certificate: '+(Join-Path $tlsDir 'ca.crt'))
    Write-Output ('Backend URLs: '+(($Addresses | ForEach-Object { 'https://'+$_+':8443' }) -join ', '))
} finally { Pop-Location }

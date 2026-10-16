param([Parameter(Mandatory=$true)][string]$InputApk,[Parameter(Mandatory=$true)][string]$OutputApk,[Parameter(Mandatory=$true)][string]$JavaHome,[Parameter(Mandatory=$true)][string]$BuildTools)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$signingDir=Join-Path $projectRoot 'data/signing'
New-Item -ItemType Directory -Path $signingDir -Force | Out-Null
$account=[Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $signingDir /inheritance:r /grant:r "${account}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not restrict signing key permissions'}
$passwordFile=Join-Path $signingDir 'password.txt'
$keystore=Join-Path $signingDir 'trial.keystore'
if (-not (Test-Path -LiteralPath $passwordFile)) {
    $random=New-Object byte[] 32
    $rng=[Security.Cryptography.RandomNumberGenerator]::Create();$rng.GetBytes($random);$rng.Dispose()
    [IO.File]::WriteAllText($passwordFile,[Convert]::ToBase64String($random))
}
if (-not (Test-Path -LiteralPath $keystore)) {
    & (Join-Path $JavaHome 'bin/keytool.exe') -genkeypair -keystore $keystore -storepass:file $passwordFile -keypass:file $passwordFile -alias t-trial -dname 'CN=TCompanion Personal Trial' -keyalg RSA -keysize 3072 -validity 3650
    if($LASTEXITCODE -ne 0){throw 'Trial signing key creation failed'}
}
$env:JAVA_HOME=$JavaHome
& (Join-Path $BuildTools 'apksigner.bat') sign --ks $keystore --ks-key-alias t-trial --ks-pass "file:$passwordFile" --out $OutputApk $InputApk
if($LASTEXITCODE -ne 0){throw 'APK signing failed'}
& (Join-Path $BuildTools 'apksigner.bat') verify --verbose $OutputApk
if($LASTEXITCODE -ne 0){throw 'APK signature verification failed'}

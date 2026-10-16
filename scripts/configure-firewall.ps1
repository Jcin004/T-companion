param([Parameter(Mandatory=$true)][string]$LocalAddress)
$ErrorActionPreference='Stop'
[void][System.Net.IPAddress]::Parse($LocalAddress)
$projectRoot=Split-Path $PSScriptRoot -Parent
$python=Join-Path $projectRoot '.venv/Scripts/python.exe'
$program=(& $python -c 'import sys;print(sys._base_executable)').Trim()
$ruleName='TCompanionTrialHTTPS8443'
if (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue) {
    throw 'This trial rule already exists. Inspect it before replacing it.'
}
New-NetFirewallRule -Name $ruleName -DisplayName 'T- Companion trial HTTPS 8443 (local subnet)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8443 -LocalAddress $LocalAddress -RemoteAddress LocalSubnet -Profile Any -Program $program | Select-Object Name,Enabled,Direction,Action

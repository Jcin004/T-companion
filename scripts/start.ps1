param([int]$Port=8000, [string]$Bind='127.0.0.1', [switch]$Https, [switch]$Restart)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$dataDir=Join-Path $projectRoot 'data'
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
$pidFile=Join-Path $dataDir "server-$Port.pid"
if ($Restart -and (Test-Path -LiteralPath $pidFile)) {
    $serverId=[int](Get-Content -LiteralPath $pidFile)
    $process=Get-CimInstance Win32_Process -Filter "ProcessId=$serverId"
    if ($process -and $process.CommandLine.Contains($projectRoot) -and $process.CommandLine.Contains('backend.app.serve')) {
        $children=Get-CimInstance Win32_Process -Filter "ParentProcessId=$serverId"
        foreach ($child in $children) { if ($child.CommandLine -like '*backend.app.serve*') { Stop-Process -Id $child.ProcessId } }
        Stop-Process -Id $serverId -ErrorAction SilentlyContinue
    }
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is occupied" }
$python=Join-Path $projectRoot '.venv/Scripts/python.exe'
$env:T_CHAT_DB=Join-Path $dataDir 'chat.db'
$arguments=@('-m','backend.app.serve','--port',"$Port")
if ($Https) {
    $arguments+=@('--tls-host',$Bind,'--key',('"'+(Join-Path $dataDir 'tls/server-key.pem')+'"'),'--cert',('"'+(Join-Path $dataDir 'tls/server.crt')+'"'))
} elseif ($Bind -notin @('127.0.0.1','localhost')) { throw 'Remote binding requires -Https' }
$process=Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataDir "server-$Port.out.log") -RedirectStandardError (Join-Path $dataDir "server-$Port.err.log")
Set-Content -LiteralPath $pidFile -Value $process.Id
Write-Output "Started T- on port $Port. Logs: $dataDir/server-$Port.err.log"

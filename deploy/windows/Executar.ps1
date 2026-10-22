param([Parameter(Mandatory=$true)][ValidateSet('agenda','proxy')][string]$Componente)
$ErrorActionPreference = 'Stop'
$agendaRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
Set-Location -LiteralPath $agendaRoot
$nodePath = Join-Path $agendaRoot 'runtime\node.exe'
$scriptPath = if ($Componente -eq 'agenda') { 'scripts\selfhost\start.mjs' } else { 'scripts\selfhost\proxy.mjs' }
$logDirectory = Join-Path $agendaRoot 'logs'
[IO.Directory]::CreateDirectory($logDirectory) | Out-Null
foreach ($kind in @('out','err')) {
    $logFile = Join-Path $logDirectory "$Componente-$kind.log"
    if ((Test-Path -LiteralPath $logFile) -and (Get-Item -LiteralPath $logFile).Length -gt 20MB) {
        Move-Item -LiteralPath $logFile -Destination "$logFile.1" -Force
    }
}
$process = Start-Process -FilePath $nodePath -ArgumentList @($scriptPath) -WorkingDirectory $agendaRoot -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput (Join-Path $logDirectory "$Componente-out.log") -RedirectStandardError (Join-Path $logDirectory "$Componente-err.log")
exit $process.ExitCode

#Requires -RunAsAdministrator
param([Parameter(Mandatory=$true)][string]$Backup)
$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath $Backup).Path
$agendaRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
Set-Location -LiteralPath $agendaRoot
foreach ($name in @('AgendaRealessHTTPS','AgendaRealess')) {
    if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $name }
}
Start-Sleep -Seconds 2
& '.\runtime\node.exe' '.\scripts\selfhost\restore.mjs' $source
if ($LASTEXITCODE -ne 0) { throw 'A restauração foi interrompida. Confira a mensagem e os processos ainda em execução.' }
Write-Host 'Restauração concluída. Inicie as tarefas manualmente depois de conferir.'

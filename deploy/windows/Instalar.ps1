#Requires -RunAsAdministrator
param(
    [string]$BancoInicial,
    [switch]$SemProxy,
    [switch]$Iniciar
)
$ErrorActionPreference = 'Stop'
$agendaRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if ($agendaRoot -match '["\r\n]') { throw 'O caminho de instalação contém caracteres incompatíveis.' }
Set-Location -LiteralPath $agendaRoot
foreach ($file in @('runtime\node.exe','server.js','drizzle\0000_plain_cassandra_nova.sql')) {
    if (-not (Test-Path -LiteralPath (Join-Path $agendaRoot $file))) { throw "Arquivo ausente: $file. Extraia o pacote Windows completo." }
}
if (-not $SemProxy -and -not (Test-Path -LiteralPath (Join-Path $agendaRoot 'runtime\caddy.exe'))) { throw 'Caddy não encontrado no pacote.' }
$components = if ($SemProxy) { @('agenda') } else { @('agenda','proxy') }
foreach ($component in $components) {
    $existingTaskName = if ($component -eq 'agenda') { 'AgendaRealess' } else { 'AgendaRealessHTTPS' }
    if (Get-ScheduledTask -TaskName $existingTaskName -ErrorAction SilentlyContinue) { throw "A tarefa $existingTaskName já existe. Atualize somente o código e preserve banco-de-dados, data e .env." }
}
if (-not $SemProxy -and (Get-NetTCPConnection -State Listen -LocalPort 80,443 -ErrorAction SilentlyContinue)) { throw 'As portas 80/443 já estão em uso. Configure o proxy existente e instale com -SemProxy.' }
if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
$configurationJSON = & '.\runtime\node.exe' --input-type=module -e "import{loadConfig}from'./scripts/selfhost/config.mjs';const c=loadConfig();console.log(JSON.stringify({url:c.url.href,db:process.env.AGENDA_DB_PATH}));"
if ($LASTEXITCODE -ne 0) { throw 'Confira as variáveis do arquivo .env.' }
$configuration = $configurationJSON | ConvertFrom-Json
if (-not $SemProxy -and $configuration.url -notmatch '^https://[^/:]+/?$') { throw 'O proxy público requer PUBLIC_URL em HTTPS, sem porta.' }
if ($configuration.db -ne (Join-Path $agendaRoot 'banco-de-dados\agenda.sqlite')) { throw 'Este instalador usa banco-de-dados\agenda.sqlite. Para outro caminho, ajuste permissões e operação com a TI.' }
foreach ($directory in @('banco-de-dados','banco-de-dados\backups','data','data\caddy','logs','.next\cache')) { [IO.Directory]::CreateDirectory((Join-Path $agendaRoot $directory)) | Out-Null }

if ($BancoInicial) {
    $source = (Resolve-Path -LiteralPath $BancoInicial).Path
    $target = Join-Path $agendaRoot 'banco-de-dados\agenda.sqlite'
    if (Test-Path -LiteralPath $target) { throw 'O banco local já existe. Nada foi substituído.' }
    if ((Test-Path -LiteralPath ($source+'-wal')) -and (Get-Item -LiteralPath ($source+'-wal')).Length -gt 0) { throw 'A origem ainda tem WAL. Gere uma cópia usando a ferramenta de backup.' }
    # Validate before copying; never attach an online WAL database by copying it.
    & '.\runtime\node.exe' --input-type=module -e "import{DatabaseSync}from'node:sqlite';const d=new DatabaseSync(process.argv[1],{readOnly:true});if(d.prepare('PRAGMA quick_check').get().quick_check!=='ok')process.exit(1);for(const name of ['bookings','rooms','booking_history','agenda_visitors'])if(!d.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get('table',name))process.exit(1);d.close();" $source
    if ($LASTEXITCODE -ne 0) { throw 'O banco inicial não passou na verificação.' }
    Copy-Item -LiteralPath $source -Destination $target
}

# LocalService can read the application and modify only state, logs and cache.
& icacls.exe $agendaRoot /grant '*S-1-5-19:(OI)(CI)RX' /T /Q | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Falha ao conceder leitura para LocalService.' }
foreach ($directory in @('banco-de-dados','data','logs','.next\cache')) {
    & icacls.exe (Join-Path $agendaRoot $directory) /inheritance:r /grant:r '*S-1-5-19:(OI)(CI)M' '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /T /Q | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Falha ao configurar permissões: $directory" }
}

$principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$runner = Join-Path $agendaRoot 'deploy\windows\Executar.ps1'
foreach ($component in $components) {
    $taskName = if ($component -eq 'agenda') { 'AgendaRealess' } else { 'AgendaRealessHTTPS' }
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw "A tarefa $taskName já existe. Para atualizar, pare as tarefas e substitua somente o código; preserve banco-de-dados, data e .env." }
    $action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`" -Componente $component" -WorkingDirectory $agendaRoot
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Agenda Realess — servidor local sem login OpenAI' | Out-Null
}
if (-not $SemProxy) {
    if (-not (Get-NetFirewallRule -Name 'AgendaRealessHTTPS' -ErrorAction SilentlyContinue)) { New-NetFirewallRule -Name 'AgendaRealessHTTPS' -DisplayName 'Agenda Realess HTTP e HTTPS' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 80,443 -Program (Join-Path $agendaRoot 'runtime\caddy.exe') | Out-Null }
}
if ($Iniciar) { Start-ScheduledTask -TaskName 'AgendaRealess'; if (-not $SemProxy) { Start-ScheduledTask -TaskName 'AgendaRealessHTTPS' } }
Write-Host 'Instalação preparada. Configure DNS/roteador e confira .env antes de iniciar.'
Write-Host 'Iniciar: Start-ScheduledTask AgendaRealess; Start-ScheduledTask AgendaRealessHTTPS'
Write-Host 'Logs: pasta logs. Banco: pasta banco-de-dados. Certificados: pasta data. Backup automático diário, retenção de 30 dias.'

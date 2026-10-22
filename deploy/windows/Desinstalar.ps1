#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
foreach ($name in @('AgendaRealessHTTPS','AgendaRealess')) {
    if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $name -Confirm:$false
    }
}
if (Get-NetFirewallRule -Name 'AgendaRealessHTTPS' -ErrorAction SilentlyContinue) { Remove-NetFirewallRule -Name 'AgendaRealessHTTPS' }
Write-Host 'Tarefas e regra de firewall removidas. Código, banco, backups e certificados foram preservados.'

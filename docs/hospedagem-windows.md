# Agenda Realess — instruções históricas para servidor Windows

> Esta opção foi substituída pelo cPanel. Use [Hospedagem cPanel](hospedagem-cpanel.md) para a instalação atual.

Endereço preparado: **https://agenda.realess.com.br**. Esta versão usa Node.js/Next.js, banco SQLite no disco local e Caddy para HTTPS. Não depende de conta, autenticação, API ou banco da OpenAI.

## Instalar o pacote Windows

`AgendaRealess-Windows.zip` inclui o aplicativo compilado, Node.js 22.23.4, Caddy 2.11.7, migrações e scripts. Os executáveis são obtidos das distribuições oficiais com verificação SHA-256 (Node) e SHA-512 (Caddy). Requer Windows x64 compatível com Node 22 e PowerShell 5.1. O servidor deve ficar ligado e conectado à internet. Não é necessário instalar npm para executar o pacote.

1. Extraia a pasta do ZIP e coloque seu conteúdo em **C:\AgendaRealess**. Deve existir `C:\AgendaRealess\server.js`. Evite OneDrive, área de trabalho e compartilhamentos de rede para a instalação definitiva.
2. Copie `.env.example` para `.env`. O domínio já é `https://agenda.realess.com.br`, com porta interna 3000.
3. No PowerShell **como administrador**, execute:

```powershell
Set-Location C:\AgendaRealess
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Instalar.ps1 -BancoInicial .\migracao\agenda-sites-20261021.sqlite
```

Sem `-BancoInicial`, a primeira inicialização cria uma agenda vazia com as duas salas. O instalador recusa substituir um banco existente. O snapshot incluído contém **4 compromissos e 7 registros de histórico**, lidos em **21/10/2026 às 15h03, horário de São Paulo**. Mantém IDs, participantes, versões e salas; o cache de feriados é regenerado. Não foi importado o conteúdo truncado desse cache.

O snapshot é uma cópia daquele momento, não uma sincronização. Antes da troca definitiva, suspenda novos agendamentos no endereço antigo e atualize a cópia se houver alterações posteriores. A hospedagem antiga permanece independente durante a transição.

## DNS, rede e HTTPS

Na administração DNS de `realess.com.br`, crie/ajuste somente o registro **A** do nome **agenda**, apontando para o **IP público da empresa**. Configure `AAAA` apenas se o IPv6 também chegar ao servidor. O site institucional não precisa ser alterado.

Reserve um IP interno fixo para o Windows. No roteador/firewall da empresa, encaminhe **TCP 80 e 443** para ele. O instalador cria uma regra do Windows restrita ao Caddy nessas portas. A porta 3000 fica em `127.0.0.1` e não deve ser encaminhada à internet. Em conexões com CGNAT ou bloqueio dessas portas, a TI precisará disponibilizar um IP público ou outro ponto de entrada.

Quando DNS e encaminhamento estiverem corretos:

```powershell
Start-ScheduledTask -TaskName AgendaRealess
Start-ScheduledTask -TaskName AgendaRealessHTTPS
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

Abra `https://agenda.realess.com.br` por uma conexão externa, como um celular fora do Wi-Fi. Caddy emite e renova o certificado quando o domínio e os desafios chegam a ele. As tarefas usam **LocalService**, iniciam com o Windows sem usuário conectado e tentam reiniciar após falhas. O instalador não as inicia até você executar os comandos acima; a opção `-Iniciar` permite iniciar imediatamente.

Se IIS ou outro proxy já ocupar 80/443, use `Instalar.ps1 -SemProxy`. Nesse caso, a TI deve configurar HTTPS e encaminhar o domínio para `http://127.0.0.1:3000`, preservando o Host. `PUBLIC_URL` continua sendo o endereço público HTTPS. Não execute dois proxies nas mesmas portas.

Para uma demonstração temporária, execute **TestarLocal.cmd** e abra `http://127.0.0.1:3000`. Ele usa `banco-de-dados/teste-local.sqlite`, separado do banco definitivo. Encerre com Ctrl+C antes de iniciar o serviço na mesma porta.

## Dados e backup

| Caminho | Conteúdo |
| --- | --- |
| `banco-de-dados/agenda.sqlite` | Compromissos, salas, participantes, histórico e permissões |
| `banco-de-dados/backups/` | Backups SQLite consistentes e verificados |
| `data/caddy/` | Certificados e estado do HTTPS |
| `logs/` | Inicialização, erros e acessos HTTP |
| `.env` | Origem pública e caminhos locais |

O primeiro backup automático ocorre após um minuto; os seguintes, a cada 24 horas enquanto o servidor está executando. A retenção de 30 dias vale somente para arquivos `agenda-auto-*`. Backups manuais são preservados. Programe também a cópia dos backups para outro disco da empresa. As pastas `banco-de-dados` e `data` não devem ser expostas por um site de arquivos.

Backup manual, sem parar o servidor:

```powershell
Set-Location C:\AgendaRealess
.\runtime\node.exe .\scripts\selfhost\backup.mjs
```

Não copie somente o `.sqlite` enquanto a agenda estiver aberta: alterações recentes podem estar no WAL. O script usa a API de backup e verifica o arquivo gerado.

Para restaurar:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Restaurar.ps1 -Backup C:\Backups\agenda.sqlite
```

O script para as tarefas, verifica o backup e preserva o banco anterior antes da substituição. Depois da conferência, inicie as tarefas manualmente. Os scripts Windows usam o caminho padrão `banco-de-dados\agenda.sqlite`; para caminhos personalizados, ajuste permissões e restauração com a TI.

## Permissões e mudança de domínio

O acesso é livre pelo link. Cada navegador recebe um cookie HttpOnly aleatório; nome e e-mail não concedem permissões. A edição e os participantes privados pertencem ao navegador organizador. Limpar cookies ou mudar de navegador/domínio cria outra identidade.

A administração dos feriados é concedida apenas pelo operador do servidor. Primeiro abra a agenda no navegador desejado e informe um nome reconhecível em um compromisso. No servidor:

```powershell
.\runtime\node.exe .\scripts\selfhost\admin.mjs list
.\runtime\node.exe .\scripts\selfhost\admin.mjs grant visitor_ID_EXIBIDO
```

Para remover, use `revoke`. Cabeçalhos de identidade do antigo Sites são ignorados; um e-mail digitado no formulário nunca concede administração.

Cookies do endereço antigo não passam para o domínio novo. Para recuperar os compromissos antigos, o operador deve confirmar quem é o organizador, listar os IDs com `owners` e `list` e vincular um navegador novo que ainda não criou compromissos:

```powershell
.\runtime\node.exe .\scripts\selfhost\admin.mjs owners
.\runtime\node.exe .\scripts\selfhost\admin.mjs adopt visitor_NOVO ID_ORGANIZADOR_ANTIGO
```

A vinculação preserva os registros e o histórico. Não há recuperação pública por e-mail informado.

## Operação, atualização e código-fonte

Consulte `logs\agenda-err.log`, `logs\agenda-out.log`, `logs\proxy-err.log` e `logs\acessos.json`. `/api/health` verifica o banco sem expor dados internos. Consulte as tarefas com `Get-ScheduledTask AgendaRealess*`.

Para atualizar: faça backup, pare as tarefas, preserve `banco-de-dados`, `data`, `.env` e logs, substitua apenas o código e reinicie. As migrações pendentes são aplicadas automaticamente uma vez, antes de escutar a porta; migrações aplicadas que tiverem sido alteradas são recusadas. Não execute o instalador novamente sobre tarefas existentes. `Desinstalar.ps1` remove tarefas e a regra de firewall, preservando todos os arquivos e dados.

Desenvolvimento requer Node 22.16 ou superior: `npm ci`, `npm run build`, `npm start`. Sem `.env`, abre em `http://127.0.0.1:3000`. Para outro pacote, execute `PrepararRuntime.ps1`, `npm run build` e `node scripts/package-windows.mjs`. Dados, executáveis, exportações privadas e pacotes são ignorados pelo Git.

## E-mails

Esta mudança de hospedagem não permite enviar silenciosamente pelo Outlook do visitante. Os convites continuam abrindo o aplicativo padrão ou gerando `.ics`, com confirmação no aplicativo. O envio automático depende de um auxiliar local ou de uma integração de e-mail autorizada, ainda não selecionada.

## Referências

[Hospedagem própria Next.js](https://nextjs.org/docs/app/guides/self-hosting), [saída standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [SQLite e backup Node.js](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html), [HTTPS do Caddy](https://caddyserver.com/docs/automatic-https), [tarefas LocalService](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal?view=windowsserver2025-ps).

# Agenda Realess no cPanel

O destino desta versão é `https://agenda.realess.com.br`, hospedado como aplicação Node.js no cPanel. Ela mantém o banco SQLite em disco; os comandos do pacote Windows e o Caddy não são usados no cPanel.

## Requisitos da hospedagem

Antes de enviar o projeto, confirme com o provedor:

- Node.js **22.16 ou superior** disponível para a conta;
- recurso **Setup Node.js App**, **Application Manager/Passenger** ou **Web Apps**;
- Terminal/SSH para instalar dependências e compilar o Next.js;
- uma pasta persistente com permissão de gravação, fora de `public_html`;
- associação do domínio `agenda.realess.com.br` à aplicação e HTTPS ativo.

Node.js 22.16 é necessário porque a aplicação usa o módulo SQLite integrado ao Node. A hospedagem também precisa manter os processos de aplicações Node ativos. Os nomes dos menus e o caminho do executável variam conforme o provedor.

## Preparar o domínio e a aplicação

1. Crie ou associe `agenda.realess.com.br` à conta e habilite o SSL pelo cPanel.
2. Crie a aplicação Node.js para esse domínio. Use Node.js 22.16 ou mais recente, modo `Production` e a raiz da aplicação em uma pasta privada, por exemplo `agenda-app` dentro da sua conta, sem colocar o código ou o banco em `public_html`.
3. Selecione o arquivo inicial `deploy/cpanel/app.cjs`. A extensão `.cjs` mantém o inicializador em CommonJS apesar de o projeto usar módulos ES.
4. Configure estas variáveis no gerenciador de aplicação:

   - `PUBLIC_URL=https://agenda.realess.com.br`
   - `TZ=America/Sao_Paulo`

   Por padrão, o inicializador grava em `banco-de-dados/agenda.sqlite` e cria os backups em `banco-de-dados/backups`, dentro da pasta privada do aplicativo. Se preferir outro local privado, configure `AGENDA_DB_PATH` e `AGENDA_BACKUP_DIR` com caminhos absolutos fora de `public_html`. Confirme que o processo Node pode gravar na pasta. Não configure `PORT`: o Passenger fornece a porta da aplicação.

## Enviar e compilar o projeto

Envie o código-fonte desta pasta para a raiz da aplicação. Ao usar o Gerenciador de Arquivos, não envie as pastas locais `node_modules`, `.next`, `runtime`, `releases`, `outputs` ou `logs`: incluem dependências e artefatos do Windows ou da máquina de desenvolvimento. Não use `releases/AgendaRealess-Windows.zip`: ele contém executáveis Windows. No Terminal/SSH do cPanel, a partir da raiz da aplicação:

```bash
npm ci
npm run build
```

O build deve acontecer no Linux da hospedagem para que o Next.js instale e trace os arquivos para a plataforma correta. Depois, configure o arquivo inicial como `deploy/cpanel/app.cjs` e reinicie a aplicação pelo gerenciador do cPanel. O inicializador cria o banco e aplica as migrações antes de abrir o servidor.

## Atualizações e backups

Faça as atualizações pelo Git/SSH ou envie a nova versão dos arquivos. Preserve a pasta `agenda-data`: ela contém os compromissos e o histórico. Depois de atualizar o código, execute `npm ci`, `npm run build` e reinicie a aplicação.

Configure um Cron Job diário no cPanel para criar cópia do banco. O comando precisa usar o Node.js da aplicação e os mesmos caminhos de banco e backup definidos no cPanel. O executável do Node e a forma de passar variáveis ao Cron Job dependem do provedor. Uma forma comum é:

```bash
cd /home/USUARIO/agenda-app && AGENDA_DB_PATH=/home/USUARIO/agenda-data/agenda.sqlite AGENDA_BACKUP_DIR=/home/USUARIO/agenda-data/backups /CAMINHO/DO/NODE scripts/selfhost/backup.mjs
```

Substitua os caminhos pelo usuário, raiz do app, pasta persistente e executável Node reais da conta. Depois, confirme que o backup apareceu e mantenha uma cópia fora da conta cPanel.

## Verificação depois da publicação

- Abra `https://agenda.realess.com.br` e confirme que o certificado HTTPS está válido.
- Crie um compromisso de teste, reinicie o app pelo cPanel e confirme que o compromisso continua salvo.
- Confirme que o banco e os backups ficam fora de `public_html`.
- Consulte os logs da aplicação no cPanel se o processo não iniciar. Erros de Node antigo, caminho do banco, permissão da pasta ou arquivo inicial incorreto devem aparecer nos logs.

O cPanel da conta ainda precisa confirmar suporte a Node.js 22.16+ e habilitar o gerenciador de aplicações; o painel phpMyAdmin, por si só, não confirma esse suporte. Se a hospedagem não permitir aplicações Node, será necessário mudar de plano/provedor ou converter o app para uma plataforma compatível.

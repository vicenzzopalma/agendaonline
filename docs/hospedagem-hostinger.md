# Agenda Realess na Hostinger

A Hostinger hospeda a aplicação e o banco. O cPanel administra o DNS. O repositório contém um fluxo GitHub Actions (`.github/workflows/deploy.yaml`) que conecta por SSH à VPS e executa `/var/www/agenda/deploy_vps.sh`.

## Processo da aplicação

O script usa o Node instalado em `/opt/node22/bin`, instala as dependências com `npm ci --include=dev`, executa `npm run build` e inicia ou reinicia `agenda-realess` no PM2 com `ecosystem.config.cjs`. As dependências de desenvolvimento são necessárias para compilar; o processo executa em modo de produção.

O diretório de trabalho é a raiz do repositório, `/var/www/agenda` neste fluxo. O inicializador `scripts/selfhost/start.mjs` prepara as migrações e abre o servidor standalone, com backups automáticos enquanto estiver executando. O proxy e o HTTPS permanecem sob a configuração existente da VPS.

## Ambiente e banco novo para os testes

As variáveis existentes no ambiente da Hostinger/PM2 têm prioridade. O `.env` privado, quando presente na raiz do aplicativo, complementa as variáveis ausentes. Ele não é enviado pelo Git. Use `.env.example` como referência.

Para esta instalação, os valores pretendidos são:

```dotenv
PUBLIC_URL=https://agenda.realess.com.br
PORT=3000
AGENDA_DB_PATH=/var/www/agenda/banco-de-dados/agenda.sqlite
AGENDA_BACKUP_DIR=/var/www/agenda/banco-de-dados/backups
AGENDA_LOG_DIR=/var/www/agenda/logs
```

Mantenha `PORT` compatível com o proxy já instalado; o valor acima é o padrão do projeto. Se a raiz real do aplicativo for outra, ajuste os caminhos. O usuário do processo precisa poder gravar nas pastas do banco, backups e logs.

Para começar os testes com o banco novo, configure `AGENDA_DB_PATH` no ambiente da VPS/PM2 ou no `.env` para o novo caminho acima. Uma variável antiga no ambiente tem prioridade sobre o `.env`; ajuste-a na origem. O código não substitui essa configuração. Na primeira inicialização, o SQLite é criado com o esquema e sem compromissos importados. Os reinícios seguintes reutilizam esse banco; a publicação não o zera.

A pasta `banco-de-dados` é enviada pelo Git por meio do seu README. Os arquivos SQLite, WAL e backups são criados apenas no servidor e ignorados pelo Git. O banco fica fora de `.next`, portanto compilar uma nova versão não o recria. Preserve a mesma pasta persistente entre publicações e não a exponha no proxy web.

## Publicação e verificação

Envie as alterações para a branch `main`. O fluxo existente executa a atualização na VPS. Depois, consulte `pm2 logs agenda-realess`, crie um compromisso de teste e confirme que ele permanece após reiniciar `agenda-realess`.

As configurações DNS são feitas separadamente no cPanel e não alteram o caminho do banco. O inicializador Passenger do cPanel e o pacote Windows são adaptadores históricos, fora deste fluxo.

## Referências do provedor

- [Hostinger: publicação de aplicações Node.js e opções de VPS](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [Hostinger: implantação Node.js, PM2 e proxy na VPS](https://www.hostinger.com/in/tutorials/deploy-node-js-application)

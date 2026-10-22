# Agenda Realess

Agenda compartilhada em português para compromissos, reuniões e reservas das duas salas da Realess. Inclui links do Google Meet, participantes, convites de calendário, feriados brasileiros, histórico permanente e identidade visual da empresa. O acesso exige login e senha próprios da Realess. Nesta etapa, somente `arthur.hille` é provisionado como master. Veja [Acesso e ativação do login](docs/ACESSO-LOGIN.md).

## Hospedagem

O site é hospedado na **Hostinger**, no endereço `https://agenda.realess.com.br`. O **cPanel administra somente o DNS**. O fluxo no repositório publica a aplicação na VPS via GitHub Actions e PM2, usando Node.js 22.16 ou superior. Veja [Hospedagem Hostinger](docs/hospedagem-hostinger.md).

O ZIP de `releases/AgendaRealess-Windows.zip` contém executáveis Windows. A publicação da Hostinger usa o código-fonte e compila no Linux da VPS.

## Desenvolvimento local

Requer Node.js 22.16 ou superior.

```bash
npm ci
npm run dev
```

Sem `.env`, abra `http://127.0.0.1:3000`. O banco e as migrações são inicializados automaticamente; horários seguem o fuso de São Paulo.

Em um banco novo, execute `npm run auth:master` no terminal antes de entrar. A senha é solicitada de forma oculta. A aplicação permanece bloqueada sem uma conta provisionada.

## Comandos

| Comando | Uso |
| --- | --- |
| `npm run dev` | Desenvolvimento local |
| `npm run build` | Build standalone do Next.js |
| `npm start` | Inicia a aplicação e os backups |
| `npm run start:cpanel` | Adaptador legado para Passenger, fora do fluxo atual |
| `npm run backup` | Backup manual verificado |
| `npm run auth:master` | Cria o acesso master, sem sobrescrever uma conta existente |

O PM2 usa `ecosystem.config.cjs`, com diretório de trabalho na raiz do projeto. O inicializador aplica as migrações antes de iniciar o Next.js. Por padrão, o banco fica em `banco-de-dados/agenda.sqlite`; variáveis do ambiente têm prioridade sobre os valores do `.env` e os padrões do código. Preserve a pasta do banco ao atualizar.

O envio silencioso de convites pelo Outlook ainda exige uma integração de envio autorizada. O comportamento atual prepara o convite para o aplicativo de e-mail do usuário.

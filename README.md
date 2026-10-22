# Agenda Realess

Agenda compartilhada em português para compromissos, reuniões e reservas das duas salas da Realess. Inclui links do Google Meet, participantes, convites de calendário, feriados brasileiros, histórico permanente e identidade visual da empresa. O acesso é livre pelo link e não exige conta da OpenAI.

## Hospedagem

O destino definido é **cPanel** no endereço `https://agenda.realess.com.br`. A aplicação precisa de Node.js 22.16 ou superior, um gerenciador de aplicações Node (Passenger/Web Apps) e espaço persistente para o banco SQLite. Veja [Hospedagem cPanel](docs/hospedagem-cpanel.md) antes de enviar os arquivos.

O ZIP de `releases/AgendaRealess-Windows.zip` contém executáveis Windows e não deve ser usado no cPanel. Envie o código-fonte, instale dependências e faça o build no Linux da hospedagem.

## Desenvolvimento local

Requer Node.js 22.16 ou superior.

```bash
npm ci
npm run dev
```

Sem `.env`, abra `http://127.0.0.1:3000`. O banco e as migrações são inicializados automaticamente; horários seguem o fuso de São Paulo.

## Comandos

| Comando | Uso |
| --- | --- |
| `npm run dev` | Desenvolvimento local |
| `npm run build` | Build standalone do Next.js |
| `npm run start:cpanel` | Inicialização local pelo adaptador Passenger/cPanel |
| `npm run backup` | Backup manual verificado |
| `npm run admin -- list` | Lista navegadores registrados |

O inicializador do cPanel está em `deploy/cpanel/app.cjs`; ele aplica as migrações antes de iniciar o servidor Next.js. Preserve a pasta de dados configurada em `AGENDA_DB_PATH` ao atualizar o código.

O envio silencioso de convites pelo Outlook ainda exige uma integração de envio autorizada. O comportamento atual prepara o convite para o aplicativo de e-mail do usuário.

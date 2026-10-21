# Acesso livre pelo link

A agenda abre diretamente, sem cadastro, senha ou conta da OpenAI. Quem possui o endereço pode consultar compromissos, horários, salas, links e histórico, além de cadastrar novos compromissos. Essa é a modalidade de acesso livre escolhida pelo usuário.

Ao criar um compromisso, informe o nome do organizador. O e-mail é opcional para salvar e necessário para gerar um convite de calendário do Outlook. Nome e e-mail são informações declaradas no formulário, não uma identidade verificada. O e-mail do organizador e os participantes ficam restritos ao navegador proprietário do compromisso.

## Edição e persistência

- Um cookie HttpOnly identifica o navegador automaticamente, sem tela de entrada. Não há senha nem conta a criar.
- O cookie contém uma capacidade aleatória de 256 bits. O banco armazena apenas seu hash SHA-256, o identificador do visitante, nome/e-mail e expiração. Em produção o cookie usa prefixo `__Host-`, Secure, SameSite=Lax, escopo do próprio domínio e validade de até um ano.
- Compromissos continuam no D1 compartilhado. O cookie controla a edição e a exibição dos participantes; não armazena os agendamentos.
- “Meus compromissos” corresponde aos compromissos vinculados ao navegador. Limpar os cookies, expirar o identificador ou usar outro navegador remove essa associação. Os registros continuam visíveis na agenda, com edição restrita. Digitar o mesmo nome ou e-mail em outro navegador não recupera a propriedade.
- Os dados de contato são lembrados para os próximos formulários. O e-mail do organizador também é guardado em cada compromisso, mantendo os convites independentes de alterações posteriores no perfil local.
- As permissões são conferidas no servidor: outro navegador não pode editar/cancelar o compromisso, consultar seus participantes ou acessar o histórico detalhado de versões. As buscas também respeitam essa restrição.

## Continuidade dos registros existentes

A migração adiciona `agenda_visitors` e a coluna `bookings.organizer_email`, sem apagar/recriar compromissos, mudar seus IDs ou alterar o histórico existente.

Se a plataforma já fornecer uma identidade autenticada na primeira visita, sua associação antiga é aproveitada silenciosamente para preservar os compromissos e a permissão administrativa existentes. Essa compatibilidade é opcional: nenhuma página redireciona para a OpenAI e nenhum visitante precisa ter essa conta.

Um visitante completamente anônimo não recebe a propriedade de compromissos antigos apenas por informar o e-mail do organizador. Nesses casos, os registros antigos permanecem consultáveis. Administradores previamente identificados mantêm sua permissão neste navegador; digitar um e-mail administrativo no formulário nunca concede esse papel. A lista administrativa configurada no servidor continua sendo verificada, permitindo revogação. O e-mail de identidade de um administrador não é substituído por dados de contato declarados no formulário.

## Arquivos principais

- `lib/agenda-visitor.ts`, `lib/device-identity.ts`: identificação automática do navegador e continuidade opcional.
- `app/api/workspace/route.ts`: leitura pública, criação/edição sem login e autorização por navegador.
- `app/api/holidays/route.ts`, `app/api/calendar-policy/route.ts`, `lib/holiday-service.ts`: consulta pública de feriados e manutenção das permissões administrativas.
- `app/workspace.tsx`: remoção da tela de entrada, nome/e-mail do organizador e informações de edição.
- `app/invitation-dialog.tsx`, `lib/invitations.ts`: convites usando o e-mail informado no compromisso.
- `db/schema.ts`, `drizzle/0002_cheerful_sharon_carter.sql` e metadados: migração aditiva.
- `lib/calendar.ts`, `lib/recipients.ts`: contato do organizador e proteção na resposta pública.
- `tests/device-identity.test.mjs`, `tests/public-access.browser.mjs`: cobertura de identificação, migração e navegação anônima.

## Verificações

26 testes automatizados de regras, preservação de dados, cookies e convites aprovados, com TypeScript sem erros. Fluxo anônimo testado no Chrome e Edge, em contextos novos sem cookies da OpenAI: acesso direto, criação, edição, reinício com o mesmo cookie, download ICS, privacidade entre navegadores, bloqueio de alteração indevida e acessibilidade. A regressão de convites também verifica a continuidade dos organizadores anteriores. Evidências locais em `outputs/public-access/`.

Referências de implementação: [OWASP — gerenciamento de sessões](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) e [Cloudflare — Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/).

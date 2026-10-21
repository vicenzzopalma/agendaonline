# Convites de reunião — Agenda Realess

O acesso agora é livre pelo link, sem conta da OpenAI. Veja [acesso e permissões por navegador](acesso-livre.md). O organizador informa seu nome e e-mail no formulário do compromisso.

## Uso

1. Crie ou edite um compromisso. Informe os e-mails em **Participantes**, separados por vírgula, ponto e vírgula ou Enter. Colagens com várias linhas também funcionam. Cada etiqueta permite editar ou remover o endereço; duplicados são eliminados.
2. Preencha o link real do Meet, quando houver. A reunião pode reservar uma sala, ser presencial sem link ou ocorrer online.
3. Clique em **Salvar compromisso e preparar convite no Outlook**. O sistema primeiro salva no D1 e usa a resposta do servidor, com identificador e versão reais, para preparar o convite.
4. Na confirmação, escolha **Abrir no aplicativo de e-mail**, **Gerar convite para Outlook (.ics)** ou **Agora não**. O salvamento sozinho não abre aplicativos nem envia mensagens.
5. Confira os destinatários e o conteúdo e confirme o envio no aplicativo de e-mail.

O e-mail inclui título, data, início/fim, fuso de São Paulo, sala/local, descrição e link validado. O `mailto:` abre o aplicativo padrão do computador. Ele não permite anexar arquivos automaticamente: baixe o `.ics` e anexe-o à mensagem para enviar também o convite de calendário.

Mensagens com URI acima de 1.800 caracteres usam um fluxo conservador para evitar cortes em clientes de e-mail: copie o corpo completo, abra o aplicativo com destinatários e assunto preenchidos e cole o texto. Esse valor é uma escolha de interoperabilidade, não um limite normativo do protocolo. Também é possível copiar os destinatários e consultar a prévia completa se a abertura ou a área de transferência estiver indisponível.

Nos detalhes de um compromisso próprio, é possível preparar novamente o convite, sua atualização ou o aviso de cancelamento. Atualizações usam os participantes atuais. Após remover destinatários, a confirmação permite preparar um aviso separado de retirada com `METHOD:CANCEL`, o UID original e apenas os e-mails removidos. Se todos forem removidos, esse aviso é oferecido diretamente e a reunião permanece ativa. Essa preparação não significa que um aviso foi enviado.

Nomes antigos sem e-mail permanecem armazenados e editáveis. Novos participantes precisam ter um e-mail válido. Substitua as etiquetas antigas por endereços antes de preparar convites; o sistema não inventa endereços para essas pessoas.

## Windows e Outlook clássico

Em **Configurações → Aplicativos → Aplicativos padrão**, associe **MAILTO** e **.ics** ao **Outlook (clássico)**. Tenha a conta de e-mail configurada no Outlook. A agenda não altera essas configurações do Windows.

A verificação local encontrou o Outlook clássico instalado e em execução, mas a associação atual de MAILTO aponta para um aplicativo AppX. Para que o botão abra o clássico, essa associação precisa ser ajustada no Windows.

Ao baixar um arquivo, abra-o no Outlook; dependendo da associação, o navegador apenas o salva. O Outlook reconhece os arquivos como solicitação ou cancelamento de reunião. A forma de encaminhar/anexar e enviar depende do perfil e das configurações do Outlook. Para manter a identidade do organizador, envie pela mesma conta de e-mail identificada na agenda. Não há integração com a caixa postal, confirmação de entrega, sincronização de respostas nem envio em segundo plano.

## Implementação e dados

- Mantidos React/Vinext, Workers e D1. Não houve migração de banco nem recriação de tabelas. Os participantes continuam na coluna existente; a validação acontece no formulário e no servidor.
- O servidor retorna a reunião efetivamente persistida após criar, editar ou cancelar. Cancelamento lógico, histórico permanente, proteção de proprietário, conflitos de sala, validação de Meet e bloqueio por feriados continuam ativos.
- A lista de participantes é devolvida apenas ao organizador. Calendário, compromissos de hoje, próximos encontros e histórico removem esses dados para os demais usuários. A pesquisa de participantes considera apenas os registros do próprio usuário, evitando exposição por resultados e contagens. O histórico detalhado de versões exige o mesmo proprietário.
- O convite usa `VCALENDAR`/`VEVENT`, `UID` estável a partir do ID do compromisso, `SEQUENCE=version-1`, `DTSTAMP` da revisão salva, `ORGANIZER` com o e-mail autenticado e `ATTENDEE` para os destinatários válidos. `METHOD:REQUEST` prepara criação/atualização; `METHOD:CANCEL` e `STATUS:CANCELLED` preparam cancelamentos.
- Horários de São Paulo são resolvidos com dados IANA e convertidos para UTC, incluindo horário de verão histórico. Conteúdo usa CRLF, escape de texto e quebra de linhas até 75 octetos sem dividir caracteres UTF-8. E-mails em endereços de calendário são codificados como URI.
- Não são solicitadas senhas, nem criadas reuniões no Meet, nem acionados Outlook/COM pelo site. O script COM existe exclusivamente para QA local no Windows.
- O histórico não registra “enviado” porque a agenda não recebe confirmação do aplicativo. Exportação geral da agenda permanece separada, com `METHOD:PUBLISH`.

## Arquivos

| Arquivo                              | Alteração                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `app/workspace.tsx`                  | Participantes, salvamento antes da preparação, confirmação, atualização e cancelamento. |
| `app/recipients-field.tsx`           | Etiquetas, edição/remoção, colagem, validação e preservação de nomes antigos.           |
| `app/invitation-dialog.tsx`          | Prévia, mailto, download ICS, cópias, avisos e configuração do Windows.                 |
| `lib/recipients.ts`                  | Validação compartilhada, deduplicação, preservação e proteção de participantes.         |
| `lib/invitations.ts`                 | Mensagem profissional, URI mailto, RFC 5545/5546, UID, versões e fuso.                  |
| `app/api/workspace/route.ts`         | Validação no servidor, resposta persistida, aviso de removidos e controle de acesso.    |
| `lib/calendar.ts`                    | Indicador de participantes restritos no tipo do compromisso.                            |
| `app/globals.css`                    | Estilos responsivos das etiquetas e da preparação de convites.                          |
| `tsconfig.json`                      | Imports TypeScript explícitos para executar testes dos módulos puros no Node.           |
| `tests/invitations.test.mjs`         | Validação, mailto, ICS, fuso, segurança e busca sem exposição.                          |
| `tests/invitations.browser.mjs`      | Fluxo real no D1, Chrome e Edge, privacidade e acessibilidade.                          |
| `tests/outlook-classic.ps1`          | Leitura local de arquivos QA pelo Outlook clássico, sem enviar.                         |
| `tests/responsive.browser.mjs`       | Regressões adaptadas ao novo fluxo e confirmação.                                       |
| `tests/calendar-history.browser.mjs` | E-mail válido na fixture de criação de compromisso.                                     |

## Validação

- TypeScript sem erros e 23 testes de regras, persistência e convites aprovados.
- Regressão visual/funcional: 15 cenários entre 320 e 1920 px, paisagem e zoom; sem erros de navegador.
- Fluxos com banco real local nos navegadores **Chrome 155.0.8059.85** (1440 px) e **Edge 155.0.4283.62** (390 px): destinatários únicos/múltiplos, entrada/colagem, inválidos, duplicados, edição/remoção, Meet, reunião presencial, arquivos de convite/atualização/cancelamento, avisos de retirada, privacidade e acessibilidade. O clique mailto é interceptado para conferir a URI sem abrir aplicativos ou enviar e-mails.
- **Outlook clássico 16.0.0.20326**: leitura nativa dos três tipos de arquivo, assunto, local, destinatários e horários. Reconhecidos como `IPM.Schedule.Meeting.Request` e `IPM.Schedule.Meeting.Canceled`. A cópia nativa usa um UID QA novo, comum aos três arquivos, para evitar o cache de versões de execuções anteriores. Os testes do navegador verificam o UID real persistido e os incrementos de versão.
- O primeiro ensaio com `GetAssociatedAppointment(False)` criou dois itens temporários no calendário, apesar do parâmetro. Ambos foram retirados do calendário e movidos para Itens Excluídos; nenhum e-mail foi enviado. O teste final lê propriedades MAPI diretamente e não chama esse método. A presença de registros QA no calendário foi conferida após a limpeza.
- Nenhum envio ou recebimento real foi testado. O aplicativo padrão não foi alterado; o lançamento nativo via MAILTO continua dependente dessa configuração e da confirmação do navegador.
- Evidências locais em `outputs/invitations/` e `outputs/responsive/`; dados de teste ficam somente no armazenamento local e são cancelados ao terminar. Não foram criadas reuniões de teste no site publicado.

## Referências primárias

- [RFC 5545 — iCalendar](https://www.rfc-editor.org/rfc/rfc5545.html).
- [RFC 5546 — iTIP: solicitações, atualizações e cancelamentos](https://www.rfc-editor.org/rfc/rfc5546.html).
- [RFC 6068 — mailto](https://www.rfc-editor.org/rfc/rfc6068.html).
- [Microsoft: definir o Outlook como padrão](https://support.microsoft.com/pt-br/outlook/make-outlook-the-default-program-for-email-contacts-and-calendar).
- [Microsoft: OpenSharedItem](https://learn.microsoft.com/en-us/office/vba/api/outlook.namespace.openshareditem).
- [Microsoft: propriedade MAPI de início do compromisso](https://learn.microsoft.com/en-us/office/client-developer/outlook/mapi/pidlidappointmentstartwhole-canonical-property).

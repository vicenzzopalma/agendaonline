# Calendário brasileiro e histórico permanente

## Implementação

O backend existente foi mantido: React/Vinext, Cloudflare Workers e o banco persistente D1. Os compromissos continuam compartilhados entre dispositivos após autenticação. A alteração é incremental; nenhuma tabela de compromissos foi recriada e nenhum registro existente foi apagado.

- Logos originais: o PNG de alta resolução é usado na navegação; o JPEG com fundo compõe a imagem de compartilhamento do site. Os arquivos originais foram copiados integralmente para `public/`. O enquadramento da marca é feito pelo CSS.
- Calendário de Brasil, Santa Catarina e Joinville, consultado por ano. Feriados e pontos facultativos têm indicadores distintos e nomes no título da data e nos detalhes do dia selecionado. As reuniões mantêm seus próprios indicadores.
- Feriados oficiais impedem novas reservas e alterações para essas datas, com validação no formulário e no servidor. Reservas antigas continuam armazenadas e visíveis.
- Pontos facultativos não bloqueiam por padrão. O administrador pode bloquear esses dias inteiros e cadastrar exceções de liberação ou fechamento com justificativa. Mudanças de configuração ficam registradas no banco.
- Cancelamento lógico: o compromisso permanece com situação cancelada, horários, sala, descrição, participantes, link e metadados. O horário da sala é liberado. Cancelados podem ser pesquisados no Histórico ou exibidos pelo filtro do calendário.
- Histórico de versões gerado por triggers do banco em criação, alteração e cancelamento. A exclusão física de compromissos e a alteração/exclusão de versões são impedidas por triggers.
- Pesquisa histórica paginada por título, responsável/participantes, intervalo de datas, sala e situação. A pesquisa ignora diferenças de maiúsculas e acentos. Selecionar um resultado abre sua data e os detalhes do compromisso.
- Seletor direto de mês/ano, além de navegação anterior/próxima e Hoje. O cadastro e o calendário de feriados operam entre 1900 e 2199.
- Consultas normais carregam apenas o período visualizado, com indicadores atuais e próximos encontros em consultas próprias. A pesquisa usa páginas de 30 registros. Reuniões atualizam a cada 30 segundos; políticas e feriados visíveis são atualizados a cada 60 segundos.
- Conflitos da mesma sala continuam impedidos no banco, inclusive durante edição e entre requisições concorrentes. Cancelados não bloqueiam salas. Edições com versão antiga retornam conflito em vez de sobrescrever uma versão nova.

## Fontes e classificação dos feriados

Fontes primárias utilizadas:

- [Prefeitura de Joinville: calendário de 2026](https://www.joinville.sc.gov.br/publicacoes/calendario-de-feriados-e-pontos-facultativos-do-municipio-de-joinville-2026/), atualizado em 02/09/2026, com seus atos regulamentadores.
- [ALESC: Lei estadual 18.531/2022](https://leis.alesc.sc.gov.br/ato-normativo/21721), anexo relativo a 11 de agosto e 25 de novembro, incluindo transferência para o domingo subsequente quando recaem em dia útil.
- [Lei federal 10.607/2002](https://www.planalto.gov.br/ccivil_03/leis/2002/l10607.htm) e [Lei 14.759/2023](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm), esta última para o feriado nacional de 20 de novembro a partir de 2024.

O serviço consulta a publicação oficial do município para o ano solicitado, valida a estrutura e a completude da tabela e combina o resultado com as regras recorrentes verificadas. A base distingue feriados de pontos facultativos. Sexta-feira da Paixão e Corpus Christi são incluídos para Joinville segundo o calendário e os atos municipais. Carnaval não é convertido automaticamente em feriado obrigatório.

O cache fica no D1, separado dos compromissos, com validade de 24 horas para uma consulta bem-sucedida. Em falha de rede, página inexistente ou mudança de formato, preserva o último calendário válido e utiliza as regras recorrentes; uma nova tentativa pode ocorrer após 15 minutos. A interface informa quando está usando essa alternativa. A data da Páscoa e os dias móveis são calculados para cada ano.

Publicações anuais futuras podem ainda não existir. Pontos facultativos extraordinários dependem da publicação do respectivo ano. Mudanças legislativas nas regras recorrentes devem ser revistas quando ocorrerem; a aplicação não interpreta automaticamente o texto de novas leis. Os atos de ponto facultativo voltados ao serviço público não são apresentados como feriados obrigatórios de empresas privadas.

## Banco e implantação

`drizzle/0001_whole_terror.sql` é uma migração adicional, com os metadados correspondentes. Acrescenta colunas de situação, versão e datas de alteração/cancelamento; cria histórico, política, exceções e cache. Atualiza os triggers de conflito para considerar apenas reservas ativas. A migração anterior permanece intacta.

O preparo de dados existentes fica fora da migração, em `lib/workspace-setup.ts`, e é executado uma única vez com marcador persistente. Ele preserva os campos existentes, prepara a pesquisa e cria o registro inicial do histórico. O histórico de versões anterior à atualização não existia: o sistema preserva a versão disponível no momento da ativação, mas não pode reconstruir alterações ou exclusões antigas sem backup.

O Sites aplica a migração na implantação antes de disponibilizar o novo Worker. Para desenvolvimento, aplicar apenas a migração pendente no banco local; não repetir a migração inicial ou executar comandos de reinicialização do banco.

## Administração e autorização

`AGENDA_ADMIN_EMAILS` é uma variável de ambiente do servidor, com e-mails autenticados separados por vírgula. Foi configurada como segredo no Sites para o proprietário atual. Novos administradores exigem atualização dessa variável e nova implantação. Nenhuma credencial do banco ou lista administrativa é enviada ao navegador; o cliente recebe apenas `isAdmin`.

Em desenvolvimento, a variável pode ser passada ao processo de prévia. O `vite.config.ts` a encaminha somente no modo `serve`; o build não incorpora a configuração local. A identidade simulada de desenvolvimento continua ausente em produção.

Criar, editar e cancelar exige autenticação. Editar e cancelar continua restrito ao proprietário do compromisso. As rotas administrativas verificam a permissão no servidor. O acesso geral do site continua público por link, com autenticação para usar a agenda, conforme a configuração previamente solicitada.

## Arquivos

- Interface: `app/workspace.tsx`, `app/calendar-views.tsx`, `app/globals.css`, `app/layout.tsx`, `app/history-panel.tsx`, `app/calendar-policy.tsx`, `app/holiday-indicator.tsx` e `hooks/use-holidays.ts`.
- Backend: `app/api/workspace/route.ts`, `app/api/holidays/route.ts`, `app/api/calendar-policy/route.ts`, `lib/calendar.ts`, `lib/holidays.ts`, `lib/holiday-service.ts` e `lib/workspace-setup.ts`.
- Banco/configuração: `db/schema.ts`, `cloudflare-env.d.ts`, `vite.config.ts`, `drizzle/0001_whole_terror.sql`, `drizzle/meta/0001_snapshot.json` e `drizzle/meta/_journal.json`.
- Marca: `public/realess-logo-hd.png` e `public/realess-social.jpeg`.
- Verificação/documentação: `tests/holidays-history.test.mjs`, `tests/calendar-history.browser.mjs`, `tests/calendar-admin.browser.mjs`, `tests/responsive.browser.mjs`, `tests/workspace-setup.test.mjs`, `README.md` e este relatório.

## Verificação realizada

- TypeScript e 18 testes automatizados: datas, links, regras de feriado, pontos facultativos, exceções, atualização segura do esquema, conservação dos registros existentes, conflitos, histórico e persistência após reabrir o banco.
- Integração com o backend e o D1 locais: bloqueio de feriados, configuração administrativa, exceção autorizada, edição conflitante, duas salas simultâneas, horários consecutivos, cancelamento lógico e auditoria.
- Fonte oficial de Joinville consultada com sucesso, com 30 entradas entre feriados e pontos facultativos em 2026, incluídas as regras estaduais.
- Interface: alterar diretamente a data do formulário para feriado bloqueia salvar; navegação entre meses e anos conserva o compromisso; busca histórica abre a data correta; recarregar a página mantém o registro; logo original é carregada em resolução integral.
- Aplicação local encerrada e iniciada novamente: registro do ano anterior permaneceu disponível; usuário sem configuração administrativa recebeu 403 ao tentar alterar a política; uma edição com versão antiga recebeu 409.
- Formulário administrativo e auditoria axe-core no celular de 390 px aprovados. Foram geradas 105 versões de um compromisso local, recuperadas por paginação e abertas na interface sem duplicações. Um ano sem publicação oficial confirmou o uso das regras recorrentes e do cache de nova tentativa.
- Grade mensal conferida em 320, 375, 390, 430, 768, 1024, 1440 e 1920 px. A suíte responsiva também verifica orientação horizontal, foco, formulários, filtros, texto ampliado e estados de carregamento/erro.
- Os 15 cenários da suíte responsiva passaram com as novas funções. A consistência entre esquema, SQL e metadados Drizzle também foi verificada.

Os dados usados nos testes de integração foram criados exclusivamente no banco local e cancelados ao final. Não foram usados como substitutos dos compromissos de produção. Capturas e resultados ficam em `outputs/calendar-history/` e `outputs/responsive/`, ignorados pelo Git.

Limitações de verificação: navegador Chrome/Chromium em computador; sem aparelho físico, Safari/iOS, Firefox ou leitor de tela. Não foi realizado um teste destrutivo de restauração de backup em produção.

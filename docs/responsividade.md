# Responsividade da Agenda Realess

## Arquitetura e escopo

A página `app/page.tsx` monta `Workspace`. Esse componente coordena as visualizações, filtros, formulários, indicadores e chamadas à API. `app/globals.css` contém o sistema visual. A leitura e a escrita permanecem em `app/api/workspace/route.ts`; as regras de datas, sobreposição, links e exportação permanecem em `lib/calendar.ts`. O esquema e as migrações não foram alterados.

A refatoração preserva o sistema existente. Os calendários mensal e lateral agora ficam em `app/calendar-views.tsx`; o diálogo compartilhado fica em `app/modal.tsx`; o comportamento acessível do menu fica em `hooks/use-navigation-drawer.ts`.

## Comportamento

- Estilos base para celulares; progressão por `min-width` em 375, 480, 768, 1200 e 1600 px. Unidades relativas, `clamp()`, variáveis, Grid e Flexbox.
- Sete dias visíveis no mês, sem largura mínima de 820 px. Contagens nas datas e lista completa do dia selecionado em todas as telas. Nos tablets e computadores, os títulos também aparecem nas células.
- Seleção com clique/toque, setas, Home e End; destaque do dia atual e da data selecionada; navegação entre meses mantida.
- Menu móvel com botão de fechar, Escape, foco contido, retorno ao acionador e conteúdo de fundo inerte. Navegação completa a partir de 1200 px.
- Filtros de salas e categorias na própria agenda, com estado selecionado e opção de limpar. Os filtros laterais continuam disponíveis.
- Indicadores em grade fluida; painéis em uma ou duas colunas, ou ao lado da agenda em monitores amplos.
- Campos de formulário de 16 px e controles principais de pelo menos 44 px de altura. Formulários em uma coluna nas menores telas; botões com largura completa abaixo de 480 px.
- Diálogos contidos na área visível, rolagem interna e ações com posição sticky. A API VisualViewport acompanha a redução de altura provocada pelo teclado virtual.
- Listas com muitos compromissos têm rolagem própria. A grade semanal continua dividida em horários de 30 minutos; sua rolagem horizontal é deliberada e fica restrita à grade, com instrução no celular.
- Não há `overflow-x: hidden` global para mascarar erros de layout.

## Verificação

Suíte de navegador: `tests/responsive.browser.mjs`, executada contra a prévia local em Chromium/Chrome, com dados simulados, dezenas de compromissos e títulos/descrições longos.

Larguras: 320, 375, 390, 430, 768, 1024, 1440 e 1920 px. Orientação horizontal/altura reduzida: 667×375, 844×390 e 1024×768.

Em cada largura foram verificados: limites da página e dos cards, sete colunas do mês, indicadores e seleção de datas, teclado, navegação entre meses, filtros de sala/tipo e fins de semana, criação e edição de compromissos, acesso ao Meet, formulário de sala, Meus compromissos e ajuda. Nas larguras móveis também foram verificados foco, Escape, abertura e fechamento do menu. Estados de carregamento, erro, login e agenda vazia foram exercitados em 320, 768 e 1920 px.

Auditorias axe-core verificam as regras WCAG A/AA disponíveis no calendário mensal, filtros, formulário, menu móvel e páginas principais. Resultados e capturas ficam em `outputs/responsive/`. A checagem automática não substitui uma auditoria integral de acessibilidade.

Resultado final: 15 cenários de navegador aprovados, sem erros de JavaScript ou violações identificadas pelo axe-core. Os cenários adicionais verificaram a transição do menu para desktop, a redução da área visível do formulário e o aumento da fonte para 200%. A análise automática deixou pendente o contraste das iniciais em alguns avatares da lista; as cores efetivas `#604720` sobre `#f0e8da` foram conferidas separadamente, com relação de contraste de 7,13:1.

Também executados: TypeScript (`tsc --noEmit`), os 12 testes existentes de calendário, links e inicialização do workspace, e o build de produção pelo fluxo Sites.

## Limitações

As larguras e orientações foram simuladas no navegador de computador. Não houve teste em aparelhos físicos, Safari/iOS ou Firefox. A altura reduzida dos formulários foi testada; o teclado virtual real e as tecnologias assistivas não foram operados em dispositivos físicos. As interações visuais usam a API simulada na suíte, enquanto as regras de domínio e as restrições SQLite são verificadas pelos testes existentes. Não foram criados registros na agenda de produção durante a validação.

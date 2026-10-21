# Agenda Realess

Agenda compartilhada para organizar compromissos, atividades e reuniões da Realess. A reserva de sala é opcional. Interface em português, com visões de semana, mês e lista, busca, filtros por sala e tipo, gerenciamento de salas e exportação `.ics`.

A identidade visual segue o [site oficial da Realess](https://www.realess.com.br/), com azul-marinho `#192537`, dourado/bege `#B09E80` e superfícies brancas. O logotipo foi obtido do próprio site. Textos de leitura têm contraste reforçado; os formulários usam fontes de 16 px, com títulos, horários e controles ampliados. As faixas horárias do calendário têm 96 px para acomodar os eventos sem reduzir o tamanho das letras.

## Como funciona

- Os registros são persistidos no Cloudflare D1. O navegador guarda apenas o estado da interface.
- A identidade vem da autenticação do Sites. Cada pessoa pode editar e cancelar as próprias reservas; os encontros são visíveis para quem tiver acesso ao site.
- O site começa privado para o criador. O acesso da equipe deve ser configurado nas permissões do Sites antes do uso coletivo.
- A disponibilidade é verificada no servidor. Triggers do banco impedem conflitos, inclusive em solicitações simultâneas. Horários consecutivos são permitidos.
- A agenda atualiza a cada 30 segundos e ao voltar para a janela. Os horários seguem São Paulo (GMT−3).
- Salas com reservas atuais ou futuras não podem ser arquivadas. O histórico das salas arquivadas é mantido.
- Participantes são informações do agendamento; o site não envia e-mails nem sincroniza automaticamente com outras agendas. A exportação `.ics` permite importar encontros no Outlook ou Google Agenda.
- O formulário tem uma seção **Google Meet** para colar o link da reunião. O atalho **Abrir Google Meet** abre o serviço em outra aba para criar a chamada e copiar seu link. O link informado fica salvo no compromisso, com botões **Entrar no Meet** e **Copiar link**. Links do Meet sem `https://` são completados; outros serviços com links HTTPS continuam aceitos. A criação da chamada acontece na conta do Google, e a agenda guarda o endereço informado.

## Primeira utilização

Use **Novo compromisso** para organizar a rotina. Por padrão, o compromisso não reserva uma sala. Para reuniões presenciais, selecione **Sala de reunião 1** ou **Sala de reunião 2**, ou use o botão **Reservar sala** na área de salas. Novos espaços podem ser cadastrados a qualquer momento. Capacidade, localização e recursos são opcionais e podem ser preenchidos quando conhecidos.

A agenda começa com os registros reais, sem compromissos fictícios. A atualização das salas iniciais preserva os IDs usados pelas reservas existentes, as salas personalizadas e as salas que já têm agendamentos. Os dados iniciais são configurados por `lib/workspace-setup.ts`, fora das migrações de esquema.

## Desenvolvimento

Requer Node.js 22.13 ou superior. O projeto usa React, Vinext e o starter de integração do Sites.

```powershell
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_plain_cassandra_nova.sql
npm run dev
```

Aplique a migração apenas uma vez em cada banco local. A prévia abre em `http://127.0.0.1:5173`. O login local é simulado pelo starter; a hospedagem usa a autenticação real do Sites. Os bancos locais e de produção são independentes.

```powershell
node node_modules/typescript/bin/tsc --noEmit
node --experimental-strip-types --test tests/calendar.test.mjs
```

Os testes verificam limites de datas, conflitos, disposição de encontros sobrepostos, exportação de calendários e as restrições reais do banco SQLite.

## Arquivos principais

- `app/workspace.tsx`: interface e interações.
- `app/globals.css`: estilos e cores da identidade visual.
- `app/api/workspace/route.ts`: leitura, validação, autorização e alterações.
- `lib/calendar.ts`: datas, conflitos, disposição dos eventos e exportação.
- `db/schema.ts` e `drizzle/`: esquema e migrações.
- `.openai/hosting.json`: identidade do site e vínculo do banco.

Use o fluxo de publicação do plugin Sites para sincronizar o código, construir e publicar a versão. A migração de produção é aplicada pela hospedagem. Credenciais não pertencem ao repositório.

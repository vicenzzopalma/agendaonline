# Validação da hospedagem Windows — 21/10/2026

- Compilação Next.js 16.3.4 standalone e verificação TypeScript: aprovadas.
- Três testes de integração SQLite: migrações idempotentes, rollback de lotes, conflitos de sala, histórico permanente, importação sem auditorias duplicadas, backup/restauração e concessão/recuperação de identidade por ferramenta offline: aprovados.
- Chrome 155.0.8059.86 e Edge 155.0.4283.62, com HTTPS local pelo Caddy: criação, edição e cancelamento reais no banco de teste; convite Outlook `.ics`; privacidade; CSRF; identidade persistente e cookies Secure/HttpOnly; cabeçalhos de identidade falsos ignorados; responsividade e acessibilidade: aprovados.
- Caddy 2.11.7: configuração de produção validada para agenda.realess.com.br.
- Scripts PowerShell: sintaxe válida. Definições de conta LocalService, tarefas e reinício aceitas pelos cmdlets do Windows. A instalação administrativa não foi executada nesta estação.
- ZIP extraído em outro diretório e iniciado com o Node incluído: página, arquivos estáticos, metadados no domínio configurado, API, sessão anônima e persistência após reinicialização aprovados. `/api/health` retornou `ok`.
- Backup automático gerado pelo processo de teste e verificado. Os testes de reuniões ficaram em banco separado; não escreveram compromissos na hospedagem pública.
- Snapshot de migração: quatro compromissos e sete registros de histórico. IDs e conteúdo preservados; cache regenerável de feriados omitido porque a leitura da plataforma o truncou.

Artefato: `releases/AgendaRealess-Windows.zip`, 74.921.184 bytes. SHA-256: `63185c4fc01849ca18382d7c4cd411c42d99601c2723567335cb260240db82e9`.

O DNS de agenda.realess.com.br ainda retornou `ENOTFOUND` durante a preparação. A verificação HTTPS local usou certificado de teste, sem instalar uma autoridade no Windows. DNS, encaminhamento de portas, instalação das tarefas no servidor definitivo e emissão do certificado público dependem da configuração da infraestrutura da empresa e não foram apresentados como concluídos.

Consulte [o guia de instalação](hospedagem-windows.md). Esta versão foi preparada localmente; a hospedagem anterior não foi atualizada nem removida.

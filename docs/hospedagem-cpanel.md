# DNS pelo cPanel

A hospedagem da Agenda Realess é feita pela Hostinger. O cPanel é usado somente para gerenciar os registros DNS de agenda.realess.com.br.

O cPanel não inicia o aplicativo Node.js, não configura o PM2 e não armazena o banco da agenda. A configuração da aplicação e sua publicação estão em [Hospedagem Hostinger](hospedagem-hostinger.md).

O adaptador deploy/cpanel/app.cjs é mantido apenas por compatibilidade com instalações Passenger e não participa do fluxo atual de publicação.

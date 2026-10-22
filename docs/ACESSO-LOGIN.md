# Acesso da Agenda Realess

A agenda exige uma sessão de login em todas as páginas e APIs de dados. Cookies antigos de navegador não concedem acesso. Somente `arthur.hille` é provisionado nesta etapa, como master. Não existe cadastro público nem senha padrão no código-fonte.

## Ativar na Hostinger

Preserve o banco atual e faça um backup antes de atualizar a aplicação. Publique o código, compile com `npm run build` e crie o master no terminal da aplicação:

```sh
npm run auth:master
```

O comando solicita a senha de forma oculta e grava somente seu hash no banco configurado por `AGENDA_DB_PATH`. Use a senha definida para Arthur nesta etapa. Reinicie o processo da aplicação no PM2. Se o master já existir, o comando não altera a conta nem redefine sua senha.

Como alternativa, copie o arquivo privado `banco-de-dados/master-bootstrap.json` deste computador para a mesma pasta privada do banco na Hostinger. A primeira requisição cria o master se ele ainda não existir. Não substitua o SQLite da hospedagem pelo banco local: isso apagaria as reuniões que estão no servidor. Esse arquivo contém um hash sensível, é ignorado pelo Git, deve ter permissão 600 no Linux e pode ser retirado depois da ativação. Também é possível fornecer o hash por `AGENDA_MASTER_PASSWORD_HASH` no ambiente do servidor.

Sem uma conta provisionada, a agenda permanece bloqueada. Os dados e as reuniões anteriores são preservados pela migração. O master pode editar e excluir reuniões antigas e consultar seus históricos. Novos compromissos usam o nome da conta autenticada. Os demais usuários serão cadastrados em outra etapa.

## Verificação após publicar

- Sem login, `/` redireciona para `/login` e `/api/workspace` retorna HTTP 401.
- Entre com `arthur.hille` e a senha definida; o perfil deve indicar `Master`.
- Use `Sair`: o cookie anterior deixa de acessar a agenda.

As senhas usam scrypt com sal aleatório. As sessões duram 12 horas, seus tokens são armazenados somente como hash e o cookie é HttpOnly, SameSite=Strict e Secure em HTTPS. Tentativas de login têm limites persistentes por conta e no serviço. O servidor verifica permissões; os botões não são o controle de segurança.

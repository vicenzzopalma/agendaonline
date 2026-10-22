Esta pasta guarda o banco SQLite local da Agenda Realess e seus backups.

Banco padrão: agenda.sqlite
Backups:     backups\

Os arquivos SQLite são dados operacionais e não devem ser publicados na web nem enviados ao Git.
Na Hostinger, o processo PM2 inicia na raiz do projeto e cria agenda.sqlite nesta pasta.
AGENDA_DB_PATH e AGENDA_BACKUP_DIR do ambiente ou .env permitem configurar outros caminhos privados.
O cPanel é usado somente para DNS. Preserve esta pasta entre publicações do Git e reinícios.

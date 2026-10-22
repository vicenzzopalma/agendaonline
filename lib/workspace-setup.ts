// One-time data setup, kept outside schema migrations. Existing reservations
// retain their room IDs, and customized rooms are never reset.
export const workspaceSetupStatements = [
  "INSERT OR IGNORE INTO calendar_policy(id) VALUES('workspace')",
  "UPDATE bookings SET updated_at=created_at,last_actor_id=owner_id,search_text=replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(title || ' ' || owner_name || ' ' || participants),'á','a'),'Á','a'),'à','a'),'À','a'),'â','a'),'Â','a'),'ã','a'),'Ã','a'),'ä','a'),'Ä','a'),'é','e'),'É','e'),'è','e'),'È','e'),'ê','e'),'Ê','e'),'ë','e'),'Ë','e'),'í','i'),'Í','i'),'ì','i'),'Ì','i'),'î','i'),'Î','i'),'ï','i'),'Ï','i'),'ó','o'),'Ó','o'),'ò','o'),'Ò','o'),'ô','o'),'Ô','o'),'õ','o'),'Õ','o'),'ö','o'),'Ö','o'),'ú','u'),'Ú','u'),'ù','u'),'Ù','u'),'û','u'),'Û','u'),'ü','u'),'Ü','u'),'ç','c'),'Ç','c') WHERE updated_at=0 AND search_text='' AND NOT EXISTS (SELECT 1 FROM settings WHERE id='realess-history-v1')",
  "INSERT OR IGNORE INTO settings(id,started) VALUES('realess-history-v1',1)",
  `INSERT OR IGNORE INTO rooms (id,name,capacity,location,equipment,color)
   SELECT 'horizonte','Sala de reunião 1',0,'','','green'
   WHERE NOT EXISTS (SELECT 1 FROM settings WHERE id='workspace')`,
  `INSERT OR IGNORE INTO rooms (id,name,capacity,location,equipment,color)
   SELECT 'conexao','Sala de reunião 2',0,'','','blue'
   WHERE NOT EXISTS (SELECT 1 FROM settings WHERE id='workspace')`,
  `INSERT OR IGNORE INTO settings (id,started) VALUES ('workspace',1)`,
  `UPDATE rooms SET name='Sala de reunião 1',capacity=0,location='',equipment=''
   WHERE id='horizonte' AND name='Sala Horizonte'
   AND NOT EXISTS (SELECT 1 FROM settings WHERE id='realess-agenda-rooms-v2')`,
  `UPDATE rooms SET name='Sala de reunião 2',capacity=0,location='',equipment=''
   WHERE id='conexao' AND name='Sala Conexão'
   AND NOT EXISTS (SELECT 1 FROM settings WHERE id='realess-agenda-rooms-v2')`,
  `UPDATE rooms SET active=0
   WHERE ((id='inspira' AND name='Sala Inspira') OR (id='auditorio' AND name='Auditório'))
   AND NOT EXISTS (SELECT 1 FROM bookings WHERE room_id=rooms.id)
   AND NOT EXISTS (SELECT 1 FROM settings WHERE id='realess-agenda-rooms-v2')`,
  `INSERT OR IGNORE INTO settings (id,started) VALUES ('realess-agenda-rooms-v2',1)`,
  `UPDATE bookings SET created_by_name=owner_name, created_by_email=organizer_email WHERE (created_by_name IS NULL OR created_by_name='')`,
];

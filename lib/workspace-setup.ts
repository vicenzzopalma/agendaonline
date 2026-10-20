// One-time data setup, kept outside schema migrations. Existing reservations
// retain their room IDs, and customized rooms are never reset.
export const workspaceSetupStatements = [
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
];

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { workspaceSetupStatements } from '../lib/workspace-setup.ts';

function database() {
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../drizzle/0000_plain_cassandra_nova.sql',import.meta.url),'utf8'));
  return db;
}
function setup(db) { db.exec('BEGIN'); for(const sql of workspaceSetupStatements) db.exec(sql); db.exec('COMMIT'); }
test('new workspaces start with exactly the two named rooms, without invented capacity',()=>{
  const db=database(); setup(db);
  assert.deepEqual(db.prepare('SELECT name,capacity,location,equipment FROM rooms WHERE active=1 ORDER BY name').all().map(r=>({...r})),[
    {name:'Sala de reunião 1',capacity:0,location:'',equipment:''},
    {name:'Sala de reunião 2',capacity:0,location:'',equipment:''},
  ]);
  db.prepare("UPDATE rooms SET capacity=15,name='Sala de reunião 1 · Equipe' WHERE id='horizonte'").run();
  setup(db);
  assert.equal(db.prepare("SELECT capacity FROM rooms WHERE id='horizonte'").get().capacity,15);
  db.close();
});
test('existing sample rooms are updated once and reservation references are retained',()=>{
  const db=database();
  db.exec("INSERT INTO settings VALUES ('workspace',0); INSERT INTO rooms (id,name,capacity) VALUES ('horizonte','Sala Horizonte',8),('conexao','Sala Conexão',6),('inspira','Sala Inspira',4),('auditorio','Auditório',20);");
  db.exec("INSERT INTO bookings (id,title,date,start,end,room_id,owner_id,owner_name,created_at) VALUES ('meeting','Reunião existente','2030-01-15','09:00','10:00','horizonte','user','Pessoa',0)");
  setup(db);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM rooms WHERE active=1').get().count,2);
  assert.equal(db.prepare("SELECT room_id FROM bookings WHERE id='meeting'").get().room_id,'horizonte');
  assert.equal(db.prepare("SELECT name FROM rooms WHERE id='horizonte'").get().name,'Sala de reunião 1');
  db.exec("UPDATE rooms SET capacity=12,location='Térreo',equipment='TV' WHERE id='horizonte'");
  setup(db);
  assert.equal(db.prepare("SELECT equipment FROM rooms WHERE id='horizonte'").get().equipment,'TV');
  db.close();
});
test('custom rooms and sample rooms with real reservations are preserved',()=>{
  const db=database();
  db.exec("INSERT INTO settings VALUES ('workspace',1); INSERT INTO rooms (id,name,capacity) VALUES ('horizonte','Minha sala',10),('conexao','Sala Conexão',6),('inspira','Sala Inspira',4);");
  db.exec("INSERT INTO bookings (id,title,date,start,end,room_id,owner_id,owner_name,created_at) VALUES ('meeting','Reserva existente','2030-01-15','09:00','10:00','inspira','user','Pessoa',0)");
  setup(db);
  assert.equal(db.prepare("SELECT name FROM rooms WHERE id='horizonte'").get().name,'Minha sala');
  assert.equal(db.prepare("SELECT active FROM rooms WHERE id='inspira'").get().active,1);
  db.close();
});

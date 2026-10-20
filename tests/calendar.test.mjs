import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { addDays, monday, overlaps, placeEvents, createICS } from '../lib/calendar.ts';

test('calendar dates respect São Paulo and week boundaries', () => {
  assert.equal(monday('2026-10-20'), '2026-10-19');
  assert.equal(monday('2026-10-25'), '2026-10-19');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});
test('room conflict check permits back-to-back and remote meetings', () => {
  const a = { date:'2026-10-20',start:'09:00',end:'10:00',roomId:'a' };
  assert.equal(overlaps(a, {...a,start:'09:30',end:'10:30'}),true);
  assert.equal(overlaps(a, {...a,start:'10:00',end:'11:00'}),false);
  assert.equal(overlaps(a, {...a,roomId:'b'}),false);
  assert.equal(overlaps({...a,roomId:null}, {...a,roomId:null}),false);
});
test('overlapping events remain visible in separate calendar lanes', () => {
  const events=[{id:'1',start:'09:00',end:'10:30'},{id:'2',start:'09:30',end:'11:00'},{id:'3',start:'10:30',end:'11:30'},{id:'4',start:'12:00',end:'13:00'}];
  const placed=placeEvents(events);
  assert.deepEqual(placed.map(p=>[p.event.id,p.lane,p.lanes]),[['1',0,2],['2',1,2],['3',0,2],['4',0,1]]);
});
test('ICS export escapes text, converts local time to UTC, and folds UTF-8 lines', () => {
  const ics=createICS([{id:'abc',title:'Reunião, pauta; ação',date:'2026-10-20',start:'09:00',end:'10:00',description:'Primeira linha\n'+ 'Conexão '.repeat(30),link:'',roomId:'a'}],[{id:'a',name:'Sala A'}],new Date('2026-10-20T12:00:00Z'));
  assert.ok(ics.includes('DTSTART:20261020T120000Z'));
  assert.ok(ics.includes('SUMMARY:Reunião\\, pauta\\; ação'));
  assert.ok(ics.includes('DESCRIPTION:Primeira linha\\n'));
  assert.ok(ics.split('\r\n').every(line=>Buffer.byteLength(line,'utf8')<=75));
});
test('database enforces conflicts on insert and update, including inactive rooms', () => {
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../drizzle/0000_plain_cassandra_nova.sql',import.meta.url),'utf8'));
  db.exec("INSERT INTO rooms (id,name,capacity) VALUES ('a','A',8),('b','B',6),('c','C',4); UPDATE rooms SET active=0 WHERE id='c';");
  const insert=db.prepare("INSERT INTO bookings (id,title,date,start,end,room_id,owner_id,owner_name,created_at) VALUES (?,'Reunião','2026-10-20',?,?,?,'user','Pessoa',0)");
  insert.run('1','09:00','10:00','a');
  assert.throws(()=>insert.run('2','09:30','10:30','a'),/ROOM_CONFLICT/);
  assert.throws(()=>insert.run('3','08:00','11:00','a'),/ROOM_CONFLICT/);
  insert.run('4','10:00','11:00','a');
  insert.run('5','09:00','10:00','b');
  insert.run('6','09:00','10:00',null);
  insert.run('7','09:00','10:00',null);
  assert.throws(()=>insert.run('8','12:00','13:00','c'),/ROOM_INACTIVE/);
  assert.throws(()=>db.prepare("UPDATE bookings SET start='09:30' WHERE id='4'").run(),/ROOM_CONFLICT/);
  assert.equal(db.prepare("SELECT start FROM bookings WHERE id='4'").get().start,'10:00');
  db.close();
});

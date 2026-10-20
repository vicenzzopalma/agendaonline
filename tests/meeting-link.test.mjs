import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMeetingLink,meetingLinkInfo,bookingLocation,createICS} from '../lib/calendar.ts';

test('Meet links copied with or without https are normalized and recognized',()=>{
  assert.equal(normalizeMeetingLink('  meet.google.com/abc-defg-hij  '),'https://meet.google.com/abc-defg-hij');
  assert.deepEqual(meetingLinkInfo('https://MEET.GOOGLE.COM/abc-defg-hij?authuser=1'),{url:'https://meet.google.com/abc-defg-hij?authuser=1',isMeet:true});
  assert.equal(normalizeMeetingLink('https://meet.google.com/lookup/team-meeting'),'https://meet.google.com/lookup/team-meeting');
  assert.equal(normalizeMeetingLink(''), '');
});
test('invalid and unsafe links are rejected; only the exact Google Meet host gets its label',()=>{
  for(const link of ['http://meet.google.com/abc-defg-hij','javascript:alert(1)','data:text/html,test','not a link','https://meet.google.com/','https://name:password@meet.google.com/abc-defg-hij']) assert.throws(()=>normalizeMeetingLink(link),/link válido/);
  assert.equal(meetingLinkInfo('https://meet.google.com.example.com/abc-defg-hij').isMeet,false);
  assert.equal(meetingLinkInfo('https://example.com/meet.google.com/abc-defg-hij').isMeet,false);
  assert.equal(meetingLinkInfo('https://teams.microsoft.com/l/meetup-join/example').isMeet,false);
  assert.equal(meetingLinkInfo('invalid'),null);
});
test('online meetings show the saved Meet link and preserve optional physical room reservations',()=>{
  const event={id:'meet-test',title:'Reunião online',date:'2030-01-16',start:'10:00',end:'11:00',roomId:null,kind:'meeting',description:'Alinhamento da equipe',link:'https://meet.google.com/abc-defg-hij'};
  assert.equal(bookingLocation(event,[]),'Google Meet');
  assert.equal(bookingLocation({...event,roomId:'room-1'},[{id:'room-1',name:'Sala de reunião 1'}]),'Sala de reunião 1');
  const ics=createICS([event],[]);
  assert.ok(ics.includes('LOCATION:Google Meet'));
  assert.ok(ics.replace(/\r\n /g,'').includes('https://meet.google.com/abc-defg-hij'));
});

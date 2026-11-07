const test = require('node:test');
const assert = require('node:assert/strict');
const {Frame} = require('../js/frame.js');
function fixture(embedded = true) {
  const sent = [], timers = new Map(); let listener, next = 0;
  const parent = {postMessage:(message,origin) => sent.push({message,origin})};
  const host = {parent,location:{href:'https://chat.content.epix/?wrapper_nonce=test-nonce'},addEventListener:(_,fn) => listener = fn,
    setTimeout:fn => {timers.set(++next,fn); return next;},clearTimeout:id => timers.delete(id)};
  if (!embedded) host.parent = host;
  const frame = new Frame(host);
  return {frame,host,parent,sent,timers,receive:(data,source = parent) => listener({data,source})};
}
test('only the wrapper window can resolve a command; nonce accompanies requests',async () => {
  const f = fixture(); const promise = f.frame.command('localProfileInfo',{});
  const request = f.sent.at(-1).message;
  assert.equal(request.wrapper_nonce,'test-nonce');
  f.receive({cmd:'response',to:request.id,result:{granted:true}},{});
  assert.equal(f.frame.pending.size,1);
  f.receive({cmd:'response',to:request.id,result:{granted:false}});
  assert.deepEqual(await promise,{granted:false}); assert.equal(f.timers.size,0);
});
test('timeout removes pending request; late reply cannot resolve it',async () => {
  const f = fixture(); const promise = f.frame.command('localProfileList');
  const id = f.sent.at(-1).message.id;
  const rejection = assert.rejects(promise,/did not respond/);
  [...f.timers.values()][0](); await rejection;
  f.receive({cmd:'response',to:id,result:{secret:'late'}});
  assert.equal(f.frame.pending.size,0);
});
test('permission denial reaches caller and does not look like success',async () => {
  const f = fixture(); const promise = f.frame.command('localProfileCreate',{display_name:'Tester'});
  f.receive({cmd:'response',to:f.sent.at(-1).message.id,result:{error:'LOCAL_PROFILE permission required'}});
  await assert.rejects(promise,/permission required/);
});
test('plain website cannot access native commands',async () => {
  const f = fixture(false);
  await assert.rejects(f.frame.command('localProfileInfo'),/Open this xite in EpixNet/);
  assert.equal(f.sent.length,0);
});
test('wrapper reconnect and ping keep protocol state explicit',() => {
  const f = fixture(); let opens=0,closes=0;
  f.frame.on('open',() => opens++); f.frame.on('close',() => closes++);
  f.receive({cmd:'wrapperOpenedWebsocket'}); assert.equal(f.frame.connected,true);
  f.receive({cmd:'ping',id:90}); assert.equal(f.sent.at(-1).message.result,'pong'); assert.equal(f.sent.at(-1).message.to,90);
  f.receive({cmd:'wrapperClosedWebsocket'}); assert.equal(f.frame.connected,false);
  assert.equal(opens,1); assert.equal(closes,1);
});

test('request IDs wrap below the wrapper authority range without colliding',async () => {
  const f = fixture(); f.frame.sequence = 999999;
  const first = f.frame.command('localProfileInfo');
  const second = f.frame.command('localProfileInfo');
  assert.deepEqual(f.sent.slice(-2).map(item => item.message.id),[999999,1]);
  f.frame.sequence = 999999;
  assert.equal(f.frame.send('innerReady'),2);
  for (const id of [999999,1]) f.receive({cmd:'response',to:id,result:{available:true}});
  await Promise.all([first,second]);
});

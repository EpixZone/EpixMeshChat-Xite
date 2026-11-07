const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

class Element {
  constructor() {
    this.children = []; this.events = {}; this.hidden = false; this.disabled = false;
    this.value = ''; this.open = false; this.scrollHeight = 0; this.clientHeight = 0; this.scrollTop = 0;
    this.classList = {toggle(){}};
  }
  set textContent(text) { this.text = String(text); this.children = []; }
  get textContent() { return (this.text || '') + this.children.map(child => child.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.text = ''; this.children = children; }
  addEventListener(name, listener) { this.events[name] = listener; }
  setAttribute() {}
  close() { this.open = false; }
  click() { this.events.click?.({preventDefault(){}}); }
}
const flush = () => new Promise(resolve => setImmediate(resolve));
async function fixture() {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const profile = {author:'epix1fixture', display_name:'Alice', own:true, xid:null};
  const group = {group_id:'private-group', title:'Private title', members:[profile]};
  const data = {profiles:[profile], public_messages:[], groups:[group], private_messages:[{
    ...group, id:'message1', kind:'message', author:profile.author, display_name:'Alice', own:true,
    sent_at:1700000000, text:'Private message contents'
  }]};
  let info = {available:true, granted:true, profile, limits:{text_bytes:4096, group_members:8}};
  let error = null, timer;
  const listeners = {};
  class Frame {
    on(name, callback) { listeners[name] = callback; }
    async command(name) {
      if (error) throw new Error(error);
      if (name === 'localProfileInfo') return info;
      if (name === 'localProfileList') return data;
      throw new Error('Unexpected fixture command: ' + name);
    }
  }
  const dialogs = [get('group-dialog'), get('profile-dialog')];
  const host = {MeshFrame:Frame, TextEncoder, setInterval:callback => timer = callback,
    document:{hidden:false, getElementById:get, createElement:() => new Element(), addEventListener(){},
      querySelectorAll:selector => selector === 'dialog' ? dialogs : []}};
  host.window = host;
  vm.runInNewContext(source, host);
  await flush();
  get('groups').children[0].click();
  get('message').value = 'Unsent private draft';
  get('group-title').value = 'Unsent private group';
  get('group-people').textContent = 'Previous member';
  dialogs.forEach(dialog => dialog.open = true);
  assert.match(get('messages').textContent, /Private message contents/);
  return {get, dialogs, setError:value => error = value, setInfo:value => info = value,
    info:() => info, refresh:async () => {timer(); await flush();},
    close:() => listeners.close(), open:async () => {listeners.open(); await flush();}};
}
function assertCleared(f) {
  assert.equal(f.get('workspace').hidden, true);
  for (const id of ['messages', 'groups', 'group-people', 'my-name', 'my-label', 'conversation-title', 'conversation-detail', 'send-status']) {
    assert.equal(f.get(id).textContent, '', id);
  }
  for (const id of ['message', 'group-title', 'profile-address']) assert.equal(f.get(id).value, '', id);
  for (const id of ['send', 'create-group', 'link-xid']) assert.equal(f.get(id).disabled, true, id);
  assert.ok(f.dialogs.every(dialog => !dialog.open));
}
test('native identity-change error clears private DOM, drafts and dialogs until reopen', async () => {
  const f = await fixture();
  f.setError('Local profile changed; reopen this xite');
  await f.refresh();
  assertCleared(f);
  assert.equal(f.get('create-profile').disabled, true);
  assert.match(f.get('welcome-status').textContent, /Reopen this xite/);
  f.setError(null); await f.open();
  assertCleared(f);
});
test('successful permission loss clears prior identity without preventing a new permission request', async () => {
  const f = await fixture();
  f.setInfo({...f.info(), granted:false, profile:null});
  await f.refresh();
  assertCleared(f);
  assert.equal(f.get('create-profile').disabled, false);
});
test('successful profile loss clears private history even while permission remains granted', async () => {
  const f = await fixture();
  f.setInfo({...f.info(), profile:null});
  await f.refresh();
  assertCleared(f);
  assert.equal(f.get('create-profile').disabled, false);
});
test('transient disconnect retains same-user history but disables mutations until reconnection', async () => {
  const f = await fixture();
  f.close();
  assert.equal(f.get('send').disabled, true);
  assert.equal(f.get('create-group').disabled, true);
  assert.match(f.get('messages').textContent, /Private message contents/);
  assert.equal(f.get('message').value, 'Unsent private draft');
  f.setError('EpixNet did not respond. Check the connection, then refresh.');
  await f.refresh();
  assert.equal(f.get('send').disabled, true);
  assert.match(f.get('messages').textContent, /Private message contents/);
  f.setError(null); await f.open();
  assert.equal(f.get('send').disabled, false);
  assert.equal(f.get('message').value, 'Unsent private draft');
});

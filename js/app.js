(function (global) {
  'use strict';
  const roomPattern = /^[a-z0-9][a-z0-9_-]{0,47}$/;
  const textBytes = text => new TextEncoder().encode(text).length;
  function profileLabel(profile) {
    const xid = profile?.xid;
    if (!xid) return 'Local profile';
    return xid.status === 'verified' ? `${xid.name} · verified xID` : `${xid.name} · ${xid.status === 'revoked' ? 'revoked link' : 'not currently verified'}`;
  }
  function publishLabel(publish) {
    if (publish?.status === 'accepted_by_peers' && Number.isSafeInteger(publish.peers) && publish.peers > 0) {
      return `Saved locally; accepted by ${publish.peers} peer${publish.peers === 1 ? '' : 's'}. This does not confirm anyone read it.`;
    }
    return 'Saved locally; no peer accepted yet.';
  }
  function shortAddress(address) { return address ? `${address.slice(0, 10)}…${address.slice(-6)}` : ''; }
  if (typeof module !== 'undefined') { module.exports = {profileLabel, publishLabel, textBytes, roomPattern}; return; }

  const $ = id => document.getElementById(id);
  const frame = new global.MeshFrame();
  const state = {info: null, data: null, rooms: new Set(['commons', 'help']), selected: {kind:'public', id:'commons'}, loading:false, busy:false, ready:false, needsReopen:false, signature:''};
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  function notice(text, error = false) {
    $('notice').textContent = text;
    $('notice').hidden = !text;
    $('notice').classList.toggle('error', error);
  }
  function connection(ready) {
    state.ready = ready;
    $('connection').textContent = ready ? 'Connected to your node' : 'Node disconnected';
    $('connection-dot').classList.toggle('ready', ready);
    controls();
  }
  function controls() {
    const unavailable = state.busy || state.loading || !state.ready || state.needsReopen;
    const noProfile = unavailable || !state.info?.profile || !state.info.granted;
    $('create-profile').disabled = unavailable || !state.info?.available;
    $('send').disabled = noProfile;
    $('add-room').disabled = noProfile;
    $('add-group').disabled = noProfile;
    $('create-group').disabled = noProfile || !(state.data?.profiles.some(p => !p.own));
    $('link-xid').disabled = noProfile;
  }
  function clearIdentity(message, needsReopen = false) {
    state.info = null; state.data = null; state.signature = '';
    state.rooms = new Set(['commons', 'help']);
    state.selected = {kind:'public', id:'commons'};
    state.needsReopen = needsReopen;
    for (const id of ['messages', 'rooms', 'groups', 'group-people']) $(id).replaceChildren();
    for (const id of ['message', 'display-name', 'group-title', 'room-name', 'profile-address']) $(id).value = '';
    for (const id of ['my-name', 'my-avatar', 'my-label', 'xid-status', 'people-count', 'conversation-title', 'conversation-detail', 'send-status']) $(id).textContent = '';
    for (const dialog of document.querySelectorAll('dialog')) if (dialog.open) dialog.close();
    $('workspace').hidden = true; $('welcome').hidden = false;
    $('no-groups').hidden = false;
    $('welcome-status').textContent = message;
    notice('');
    connection(false);
  }
  function failure(error, showError = true) {
    const invalidIdentity = error.message === 'Local profile changed; reopen this xite'
      || error.message === 'Stored local profile does not match this identity';
    if (invalidIdentity) {
      const message = 'Your local identity changed. Reopen this xite before continuing.';
      clearIdentity(message, true); notice(message, true);
      return;
    }
    if (error.message === 'LOCAL_PROFILE permission required') clearIdentity('Local profile permission is no longer granted.');
    connection(false);
    if (!state.info) $('welcome-status').textContent = /unknown command|not found/i.test(error.message) ? 'Update EpixNet to a version that supports local profiles.' : error.message;
    if (showError) notice(error.message, true);
  }
  function select(kind, id) {
    if (state.selected.kind !== kind || state.selected.id !== id) $('message').value = '';
    state.selected = {kind,id};
    renderNavigation(); renderMessages(true);
  }
  function navButton(title, kind, id) {
    const button = node('button', title);
    button.type = 'button';
    const active = state.selected.kind === kind && state.selected.id === id;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current','true');
    button.addEventListener('click', () => select(kind,id));
    return button;
  }
  function renderNavigation() {
    for (const message of state.data.public_messages) state.rooms.add(message.room);
    $('rooms').replaceChildren(...[...state.rooms].sort().map(room => navButton('# ' + room, 'public', room)));
    $('groups').replaceChildren(...state.data.groups.map(group => navButton(group.title, 'private', group.group_id)));
    $('no-groups').hidden = state.data.groups.length > 0;
  }
  function renderMessages(forceScroll = false) {
    const box = $('messages');
    const atBottom = box.scrollHeight - box.clientHeight - box.scrollTop < 100;
    const privateRoom = state.selected.kind === 'private';
    const group = privateRoom && state.data.groups.find(g => g.group_id === state.selected.id);
    if (privateRoom && !group) { select('public','commons'); return; }
    $('conversation-kind').textContent = privateRoom ? 'PRIVATE GROUP' : 'PUBLIC ROOM';
    $('conversation-title').textContent = privateRoom ? group.title : '# ' + state.selected.id;
    $('conversation-detail').textContent = privateRoom ? `Encrypted for ${group.members.length} members. Membership is fixed.` : 'Visible to everyone who downloads this xite.';
    $('people-count').textContent = privateRoom ? `${group.members.length} members` : `${state.data.profiles.length} known profiles`;
    $('people-count').title = 'Profiles stored on this device. This is not an online status.';
    const messages = privateRoom ? state.data.private_messages.filter(m => m.group_id === group.group_id) : state.data.public_messages.filter(m => m.room === state.selected.id);
    const content = messages.map(message => {
      const row = node('article',undefined,'message');
      const avatar = node('div',message.display_name.slice(0,1).toUpperCase(),'avatar');
      avatar.setAttribute('aria-hidden','true');
      const body = node('div',undefined,'message-content');
      const meta = node('div',undefined,'message-meta');
      const name = node('strong',message.display_name + (message.own ? ' (you)' : ''));
      const address = node('span',shortAddress(message.author));
      address.title = message.author;
      const time = node('time');
      const date = new Date(message.sent_at * 1000);
      if (!Number.isNaN(date.getTime())) { time.dateTime = date.toISOString(); time.textContent = date.toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
      meta.append(name,address,time);
      const profile = state.data.profiles.find(p => p.author === message.author);
      if (profile?.xid) {
        const badge = node('span',profileLabel(profile),profile.xid.status === 'verified' ? 'verified' : 'muted');
        meta.append(badge);
      }
      const text = message.kind === 'invitation' ? `${message.display_name} created this private group.` : message.text;
      body.append(meta,node('p',text,'message-text')); row.append(avatar,body); return row;
    });
    if (!content.length) {
      const empty = node('div',undefined,'messages-empty');
      empty.append(node('strong','Start the conversation'),node('p',privateRoom ? 'Only this group’s members can read these messages.' : 'Send a message here. It can reach peers when your devices connect.'));
      content.push(empty);
    }
    box.replaceChildren(...content);
    if (forceScroll || atBottom) box.scrollTop = box.scrollHeight;
  }
  function render() {
    const profile = state.info.profile;
    $('welcome').hidden = !!profile;
    $('workspace').hidden = !profile;
    $('welcome-status').textContent = state.info.granted ? 'Your local profile works without an xID.' : 'EpixNet will ask you to allow this xite to use a local profile.';
    if (profile) {
      $('my-name').textContent = profile.display_name;
      $('my-avatar').textContent = profile.display_name.slice(0,1).toUpperCase();
      $('my-label').textContent = profileLabel(profile);
      $('profile-address').value = profile.author;
      $('xid-status').textContent = profileLabel(profile);
      renderNavigation(); renderMessages();
    }
    controls();
  }
  async function refresh(showError = true) {
    if (state.loading || state.busy || state.needsReopen) return;
    state.loading = true; controls();
    try {
      const info = await frame.command('localProfileInfo',{},10000);
      if (!info?.available) throw new Error('This version of EpixNet does not support local profiles. Update EpixNet to use this xite.');
      if (state.info?.profile && (!info.granted || !info.profile || info.profile.author !== state.info.profile.author)) clearIdentity('');
      const data = info.granted ? await frame.command('localProfileList',{},20000) : {profiles:[],public_messages:[],private_messages:[],groups:[]};
      state.info = info; state.data = data; connection(true);
      const signature = JSON.stringify({info,data});
      if (signature !== state.signature) {
        state.signature = signature; render();
        if (data.truncated) notice('This device reached its local history limit. Some older messages or profiles are not shown.');
        else if (data.rejected) notice('Some stored records failed verification and were ignored.');
      }
    } catch (error) {
      failure(error, showError);
    } finally { state.loading = false; controls(); }
  }
  async function mutate(button, operation) {
    if (state.busy || state.loading || !state.ready || state.needsReopen) return;
    state.busy = true; controls(); button.disabled = true; notice('');
    try { await operation(); }
    catch (error) { failure(error); }
    finally { state.busy = false; button.disabled = false; await refresh(false); controls(); }
  }
  function showPublish(result) {
    const label = publishLabel(result.publish);
    $('send-status').textContent = label;
    notice(label);
  }
  $('profile-form').addEventListener('submit', event => {
    event.preventDefault();
    mutate($('create-profile'),async () => {
      if (!state.info.granted) {
        await frame.command('wrapperPermissionAdd','LOCAL_PROFILE');
        const info = await frame.command('localProfileInfo',{});
        if (!info.granted) throw new Error('Local profile permission was not granted.');
      }
      const result = await frame.command('localProfileCreate',{display_name:$('display-name').value.trim()});
      showPublish(result);
    });
  });
  $('message-form').addEventListener('submit',event => {
    event.preventDefault();
    const text = $('message').value.trim();
    if (!text) return;
    if (textBytes(text) > state.info.limits.text_bytes) { notice(`Message is too long. Use at most ${state.info.limits.text_bytes} UTF-8 bytes.`,true); return; }
    const selected = {...state.selected};
    mutate($('send'),async () => {
      const result = selected.kind === 'public'
        ? await frame.command('localProfilePublicPost',{room:selected.id,text})
        : await frame.command('localProfileSeal',{group_id:selected.id,text});
      if (state.selected.id === selected.id && state.selected.kind === selected.kind) $('message').value = '';
      showPublish(result);
    });
  });
  $('add-room').addEventListener('click',() => $('room-dialog').showModal());
  $('room-form').addEventListener('submit',event => {
    event.preventDefault(); const room = $('room-name').value.trim();
    if (!roomPattern.test(room)) return;
    state.rooms.add(room); $('room-dialog').close(); select('public',room); $('room-form').reset();
  });
  $('add-group').addEventListener('click',() => {
    const people = state.data.profiles.filter(p => !p.own);
    $('group-people').replaceChildren(...people.map(profile => {
      const label = node('label',undefined,'person-option');
      const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.value = profile.author; checkbox.name = 'member';
      const details = node('span',profile.display_name);
      details.append(node('small',profile.author),node('small',profileLabel(profile)));
      label.append(checkbox,details); return label;
    }));
    $('group-empty').hidden = people.length > 0;
    $('group-dialog').showModal(); controls();
  });
  $('group-form').addEventListener('submit',event => {
    event.preventDefault();
    const checked = [...$('group-people').querySelectorAll('input:checked')].map(input => input.value);
    if (!checked.length || checked.length >= state.info.limits.group_members) {
      notice(`Choose between 1 and ${state.info.limits.group_members - 1} other people.`,true); return;
    }
    const profiles = state.data.profiles.filter(profile => checked.includes(profile.author)).map(profile => profile.signed_profile);
    mutate($('create-group'),async () => {
      const result = await frame.command('localProfileGroupCreate',{title:$('group-title').value.trim(),profiles});
      state.selected = {kind:'private',id:result.record.group_id};
      $('group-dialog').close(); $('group-form').reset(); showPublish(result);
    });
  });
  $('profile-details').addEventListener('click',() => $('profile-dialog').showModal());
  $('link-xid').addEventListener('click',() => mutate($('link-xid'),async () => {
    await frame.command('certXid',{});
    const result = await frame.command('localProfileLinkXid',{});
    showPublish(result);
  }));
  document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click',() => button.closest('dialog').close()));
  $('refresh').addEventListener('click',() => refresh());
  frame.on('open',() => refresh());
  frame.on('close',() => connection(false));
  frame.on('change',() => refresh(false));
  document.addEventListener('visibilitychange',() => { if (!document.hidden) refresh(false); });
  global.setInterval(() => { if (!document.hidden) refresh(false); },5000);
  refresh(false);
})(typeof window === 'undefined' ? globalThis : window);

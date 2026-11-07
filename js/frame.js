/* EpixFrame protocol bridge. Bundled with the xite; no network dependency. */
(function (global) {
  'use strict';
  class Frame {
    constructor(host = global) {
      this.host = host;
      this.target = host.parent;
      this.nonce = new URL(host.location.href).searchParams.get('wrapper_nonce');
      this.sequence = 1;
      this.pending = new Map();
      this.connected = false;
      this.listeners = new Map();
      this.receive = this.receive.bind(this);
      host.addEventListener('message', this.receive);
      if (this.nonce && this.target !== host) this.send('innerReady');
    }
    on(name, listener) {
      const callbacks = this.listeners.get(name) || [];
      callbacks.push(listener);
      this.listeners.set(name, callbacks);
    }
    emit(name, data) {
      for (const listener of this.listeners.get(name) || []) listener(data);
    }
    nextId() {
      for (let count = 0; count < 999999; count++) {
        const id = this.sequence;
        this.sequence = id === 999999 ? 1 : id + 1;
        if (!this.pending.has(id)) return id;
      }
      throw new Error('Too many pending EpixNet requests.');
    }
    send(cmd, params = {}, extra = {}, id = this.nextId()) {
      this.target.postMessage({cmd, params, id, wrapper_nonce: this.nonce, ...extra}, '*');
      return id;
    }
    command(cmd, params = {}, timeout = 60000) {
      if (!this.nonce || this.target === this.host) return Promise.reject(new Error('Open this xite in EpixNet.'));
      return new Promise((resolve, reject) => {
        const id = this.nextId();
        const timer = this.host.setTimeout(() => {
          this.pending.delete(id);
          reject(new Error('EpixNet did not respond. Check the connection, then refresh.'));
        }, timeout);
        this.pending.set(id, {resolve, reject, timer});
        this.send(cmd, params, {}, id);
      });
    }
    receive(event) {
      if (event.source !== this.target || !event.data || typeof event.data !== 'object') return;
      const data = event.data;
      if (data.cmd === 'response') {
        const request = this.pending.get(data.to);
        if (!request) return;
        this.pending.delete(data.to);
        this.host.clearTimeout(request.timer);
        if (data.result && data.result.error) request.reject(new Error(String(data.result.error)));
        else request.resolve(data.result);
      } else if (data.cmd === 'ping') {
        this.send('response', {}, {to: data.id, result: 'pong'});
      } else if (data.cmd === 'wrapperReady') {
        this.send('innerReady');
      } else if (data.cmd === 'wrapperOpenedWebsocket') {
        this.connected = true;
        this.emit('open');
      } else if (data.cmd === 'wrapperClosedWebsocket') {
        this.connected = false;
        this.emit('close');
      } else if (data.cmd === 'setSiteInfo') {
        this.emit('change', data.params);
      }
    }
  }
  if (typeof module !== 'undefined') module.exports = {Frame};
  else global.MeshFrame = Frame;
})(typeof window === 'undefined' ? globalThis : window);

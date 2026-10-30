// Small JSON-RPC 2.0 client. Reconnection and tab visibility are owned by LiveProvider.
export class HermesSocket {
  constructor(url, { onFrame, onOpen, onClose, onError }) {
    this.url = url;
    this.onFrame = onFrame;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.onError = onError;
    this.pending = new Map();
    this.sequence = 0;
    this.closed = false;
  }

  connect() {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.onopen = () => this.onOpen?.();
    socket.onmessage = (event) => {
      let frame;
      try { frame = JSON.parse(event.data); } catch { return; }
      if (frame?.id !== undefined && this.pending.has(String(frame.id))) {
        const pending = this.pending.get(String(frame.id));
        this.pending.delete(String(frame.id));
        clearTimeout(pending.timeout);
        if (frame.error) {
          const error = new Error(frame.error.message || "Hermes request failed");
          error.code = frame.error.code;
          pending.reject(error);
        } else pending.resolve(frame.result);
      }
      this.onFrame?.(frame);
    };
    socket.onerror = (event) => this.onError?.(event);
    socket.onclose = (event) => {
      this.rejectPending(new Error("The live Hermes connection closed."));
      this.onClose?.(event);
    };
    return this;
  }

  call(method, params = {}, timeoutMs = 20000) {
    if (this.closed || this.socket?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Hermes live connection is not open."));
    }
    const id = `desk-${Date.now().toString(36)}-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Hermes did not answer ${method} in time.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  respond(id, result) {
    if (this.closed || this.socket?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Hermes live connection is not open."));
    }
    this.socket.send(JSON.stringify({ jsonrpc: "2.0", id, result }));
    return Promise.resolve();
  }

  rejectPending(error) {
    this.pending.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(error);
    });
    this.pending.clear();
  }

  close() {
    this.closed = true;
    this.rejectPending(new Error("Live connection paused."));
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) this.socket.close(1000, "Hermes Desk hidden");
  }
}

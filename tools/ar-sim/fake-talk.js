// Saath AR simulator: talking with no paid calls. A fake speech recogniser that "hears" window.__say when you let
// go of the mic, and /api/* answered in the page from window.__api.plan ({headMs, lines: [[delayMs, line], ...]}, a
// recorded reply; 'down' or {status} for failures). Copied from the bug-hunt harness (scratchpad bughunt-ar/lib.mjs).
(() => {
  if (window.top !== window) return;
  window.__rec = [];
  class FakeSR {
    constructor() { window.__rec.push(this); }
    start() { this.started = true; }
    stop() {
      this.stopped = true;
      const list = window.__results || (window.__say ? [window.__say] : []);
      setTimeout(() => {
        if (list.length) this.onresult?.({ resultIndex: 0, results: list.map((t) => Object.assign([{ transcript: t }], { isFinal: true })) });
        if (window.__srError) this.onerror?.({ error: window.__srError });
        this.onend?.();
      }, 50);
    }
    abort() { this.aborted = true; setTimeout(() => this.onend?.(), 0); }
  }
  window.SpeechRecognition = window.webkitSpeechRecognition = FakeSR;
  const real = window.fetch.bind(window), enc = new TextEncoder(), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__api = { calls: [], plan: null };
  window.fetch = async (input, opts = {}) => {
    const u = String(input instanceof Request ? input.url : input);
    if (!u.includes('/api/')) return real(input, opts);
    let body = null; try { body = JSON.parse(opts.body); } catch {}
    const call = { url: u, body, t: performance.now(), aborted: false, sent: 0 };
    __api.calls.push(call);
    opts.signal?.addEventListener('abort', () => { call.aborted = true; });
    if (body?.warm) return new Response(null, { status: 204 });
    const plan = typeof __api.plan === 'function' ? __api.plan(call) : __api.plan;
    if (!plan || plan === 'down') { await sleep(30); throw new TypeError('Failed to fetch'); }
    if (plan.status) return new Response('{"error":"x"}', { status: plan.status });
    await new Promise((res, rej) => {
      const t = setTimeout(res, plan.headMs ?? 0);
      opts.signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('The user aborted a request.', 'AbortError')); });
    });
    const stream = new ReadableStream({ async start(c) {
      opts.signal?.addEventListener('abort', () => { try { c.error(new DOMException('The user aborted a request.', 'AbortError')); } catch {} });
      for (const [ms, line] of plan.lines) { await sleep(ms); if (call.aborted) return; c.enqueue(enc.encode(JSON.stringify(line) + '\n')); call.sent++; }
      if (!call.aborted) c.close();
    } });
    return new Response(stream, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
  };
})();

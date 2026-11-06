import { GenerationIntent } from '../src/generation-intent.mjs';
import { searchSources } from '../src/search-sources.mjs';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { augment } from '../src/protocol.mjs';
import { SSEDecoder, ReplyAccumulator } from '../src/stream.mjs';
export default defineContentScript({
  matches: ['https://chat.deepseek.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    let enabled = false,
      mode = 'auto';
    const intents = new GenerationIntent();
    document.addEventListener('more-genui-intent', (event) => {
      try {
        const value = JSON.parse((event as CustomEvent).detail);
        if (intents.arm(value))
          document.dispatchEvent(
            new CustomEvent('more-genui-intent-ack', {
              detail: JSON.stringify(value ? { id: value.id, revision: value.revision } : null),
            }),
          );
      } catch {
        /* Invalid bridge messages do not alter a prepared intent. */
      }
    });
    const post = (data: object) => window.postMessage(data, location.origin);
    window.addEventListener('message', (e) => {
      if (
        e.source === window &&
        e.origin === location.origin &&
        e.data?.type === 'more-genui-enabled'
      ) {
        enabled = e.data.enabled === true;
        mode = e.data.mode ?? 'auto';
        if (!enabled) intents.arm(null);
      }
    });
    post({ type: 'more-genui-ready' });
    const streamPaths = new Set(
      ['completion', 'regenerate', 'continue', 'resume_stream', 'edit_message'].map(
        (name) => '/api/v0/chat/' + name,
      ),
    );
    const target = (url: URL) =>
      enabled && url.origin === location.origin && streamPaths.has(url.pathname);
    const needsPrompt = (url: URL) =>
      ['/api/v0/chat/completion', '/api/v0/chat/edit_message'].includes(url.pathname);
    const rewrite = (text: string) => {
      const body = JSON.parse(text);
      if (typeof body?.prompt !== 'string') throw Error('Unknown prompt');
      const match = intents.consume(location.pathname, body.prompt);
      if (match)
        post({ type: 'more-genui-consumed', intentId: match.id, revision: match.revision });
      if (mode === 'demand' && !match && !/本次修复标识：[a-f0-9-]+/.test(body.prompt)) return text;
      return JSON.stringify({ ...body, prompt: augment(body.prompt, true, match?.kind) });
    };
    function observe(body = '') {
      const route = location.pathname;
      const repairToken = /本次修复标识：([a-f0-9-]+)/.exec(body)?.[1];
      const id = crypto.randomUUID();
      let ended = false,
        failed = false;
      const accumulator = new ReplyAccumulator((source: string) =>
        post({ type: 'more-genui-source', id, route, source }),
      );
      let sourcesKey = '';
      const sse = new SSEDecoder(
        (event: any) => {
          if (event?.response_message_id != null)
            post({
              type: 'more-genui-identity',
              route,
              id,
              key: String(event.response_message_id),
            });
          if (failed) return;
          if (event?.type === 'error' || event?.finish_reason === 'cancelled') {
            failed = true;
            return;
          }
          accumulator.accept(event);
          const sources = searchSources(accumulator.fragments);
          const key = JSON.stringify(sources);
          if (sources.length && sourcesKey !== key) {
            sourcesKey = key;
            post({ type: 'more-genui-search', route, id, sources });
          }
        },
        () => {
          failed = true;
        },
      );
      post({ type: 'more-genui-start', id, route, repairToken });
      return {
        push(text: string) {
          if (ended || failed) return;
          try {
            sse.push(text);
          } catch {
            failed = true;
            post({ type: 'more-genui-unsupported' });
          }
        },
        end(status = 'complete') {
          if (ended) return;
          ended = true;
          if (!failed && !sse.buffer.trim() && status === 'complete') accumulator.scanner.finish();
          post({ type: 'more-genui-end', id, route, status: failed ? 'unsupported' : status });
        },
      };
    }
    const originalFetch = window.fetch;
    window.fetch = async function (input, init) {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (!target(url)) return originalFetch.call(window, input, init);
      let request: Request;
      try {
        request = new Request(input instanceof Request ? input.clone() : input, init);
        if (request.method !== 'POST') return originalFetch.call(window, input, init);
        if (needsPrompt(url))
          request = new Request(request, { body: rewrite(await request.clone().text()) });
      } catch {
        const fallback = observe();
        post({ type: 'more-genui-unsupported', route: location.pathname });
        try {
          return await originalFetch.call(window, input, init);
        } finally {
          fallback.end('unsupported');
        }
      }
      const stream = observe(await request.clone().text());
      try {
        const response = await originalFetch.call(window, request);
        if (!response.ok || !response.body) {
          stream.end('http-error');
          return response;
        }
        const copy = response.clone();
        void (async () => {
          const reader = copy.body!.getReader(),
            decoder = new TextDecoder();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                stream.push(decoder.decode());
                break;
              }
              stream.push(decoder.decode(value, { stream: true }));
            }
          } catch {
            stream.end('network-error');
          } finally {
            reader.releaseLock();
            stream.end();
          }
        })();
        return response;
      } catch (error) {
        stream.end(
          error instanceof DOMException && error.name === 'AbortError'
            ? 'cancelled'
            : 'network-error',
        );
        throw error;
      }
    };
    // Current official web client consumes cumulative XHR responseText. Observe a
    // private cursor only; never change the application's callbacks or response.
    const requests = new WeakMap<
      XMLHttpRequest,
      { method: string; url: URL; cleanup?: () => void }
    >();
    const originalOpen = XMLHttpRequest.prototype.open,
      originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      async: boolean = true,
      username?: string | null,
      password?: string | null,
    ) {
      requests.get(this)?.cleanup?.();
      requests.set(this, {
        method: method.toUpperCase(),
        url: new URL(String(url), location.href),
      });
      return originalOpen.call(this, method, url, async, username, password);
    };
    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      const request = requests.get(this);
      if (!request || request.method !== 'POST' || !target(request.url))
        return originalSend.call(this, body);
      let outgoing = body;
      try {
        if (needsPrompt(request.url)) {
          if (typeof body !== 'string') throw Error('Unsupported XHR body');
          outgoing = rewrite(body);
        }
      } catch {
        const fallback = observe();
        this.addEventListener('loadend', () => fallback.end('unsupported'), { once: true });
        post({ type: 'more-genui-unsupported', route: location.pathname });
        return originalSend.call(this, body);
      }
      const stream = observe(typeof outgoing === 'string' ? outgoing : '');
      const hooks = new AbortController();
      let offset = 0;
      const progress = () => {
        if (
          this.status < 200 ||
          this.status >= 300 ||
          (this.responseType && this.responseType !== 'text')
        )
          return;
        try {
          const text = this.responseText;
          stream.push(text.slice(offset));
          offset = text.length;
        } catch {
          stream.end('unsupported');
        }
      };
      const finish = () => {
        progress();
        hooks.abort();
        this.removeEventListener('progress', progress);
        this.removeEventListener('loadend', finish);
        stream.end(
          this.status >= 200 && this.status < 300
            ? 'complete'
            : this.status === 0
              ? 'cancelled'
              : 'http-error',
        );
        request.cleanup = undefined;
      };
      for (const event of ['abort', 'timeout', 'error'])
        this.addEventListener(event, () => stream.end(event), { once: true, signal: hooks.signal });
      request.cleanup = () => {
        stream.end('cancelled');
        finish();
      };
      this.addEventListener('progress', progress);
      this.addEventListener('loadend', finish);
      try {
        return originalSend.call(this, outgoing);
      } catch (error) {
        finish();
        throw error;
      }
    };
  },
});

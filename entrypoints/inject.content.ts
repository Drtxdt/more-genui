import { defineContentScript } from 'wxt/utils/define-content-script';
import { augment } from '../src/protocol.mjs';
import { SSEDecoder, ReplyAccumulator } from '../src/stream.mjs';
export default defineContentScript({
  matches: ['https://chat.deepseek.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    let enabled = false;
    const post = (data: object) => window.postMessage(data, location.origin);
    window.addEventListener('message', (e) => {
      if (
        e.source === window &&
        e.origin === location.origin &&
        e.data?.type === 'more-genui-enabled'
      )
        enabled = e.data.enabled === true;
    });
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
      return JSON.stringify({ ...body, prompt: augment(body.prompt) });
    };
    function observe() {
      const id = crypto.randomUUID();
      let ended = false,
        failed = false;
      const accumulator = new ReplyAccumulator((source: string) =>
        post({ type: 'more-genui-source', id, source }),
      );
      const sse = new SSEDecoder((event: unknown) => accumulator.accept(event));
      post({ type: 'more-genui-start', id });
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
        end() {
          if (ended) return;
          ended = true;
          post({ type: 'more-genui-end', id });
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
        post({ type: 'more-genui-unsupported' });
        return originalFetch.call(window, input, init);
      }
      const stream = observe();
      try {
        const response = await originalFetch.call(window, request);
        if (!response.ok || !response.body) {
          stream.end();
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
            post({ type: 'more-genui-unsupported' });
          } finally {
            reader.releaseLock();
            stream.end();
          }
        })();
        return response;
      } catch (error) {
        stream.end();
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
        post({ type: 'more-genui-unsupported' });
        return originalSend.call(this, body);
      }
      const stream = observe();
      let offset = 0;
      const progress = () => {
        if (this.responseType && this.responseType !== 'text') return;
        try {
          const text = this.responseText;
          stream.push(text.slice(offset));
          offset = text.length;
        } catch {
          post({ type: 'more-genui-unsupported' });
        }
      };
      const finish = () => {
        progress();
        this.removeEventListener('progress', progress);
        this.removeEventListener('loadend', finish);
        stream.end();
        request.cleanup = undefined;
      };
      request.cleanup = finish;
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

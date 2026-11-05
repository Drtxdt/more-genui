import { mountSurface } from '../../src/surface';
import { StateRepository } from '../../src/state.mjs';
const repository = new StateRepository({
  async get(key: string) {
    return JSON.parse(localStorage.getItem(key) || 'null');
  },
  async set(key: string, value: unknown) {
    localStorage.setItem(key, JSON.stringify(value));
  },
});
let requestVersion = 0;
let surface: ReturnType<typeof mountSurface> | undefined;
async function show(name = 'wave', source?: string) {
  const version = ++requestVersion;
  const html = source ?? (await (await fetch('/examples/' + name + '.html')).text());
  if (version !== requestVersion) return;
  surface?.dispose();
  surface = mountSurface(document.querySelector('#app')!, {
    source: html,
    scope: 'test-conversation',
    instance: name,
    repository,
    draft(text) {
      document.querySelector('textarea')!.value += text;
    },
    repair(text) {
      document.querySelector('textarea')!.value = text;
    },
  });
}
Object.assign(window, { show });
void show();

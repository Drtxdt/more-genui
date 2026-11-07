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

Object.assign(window, {
  mountStress: async () => {
    const container = document.createElement('div');
    container.id = 'stress';
    document.body.append(container);
    for (let i = 0; i < 100; i++) {
      const article = document.createElement('article');
      article.className = 'ds-message';
      article.textContent = '消息 ' + i + ' ' + '说明 '.repeat(20);
      container.append(article);
    }
    const surfaces = [];
    for (let i = 0; i < 20; i++) {
      const host = document.createElement('div');
      container.append(host);
      surfaces.push(
        mountSurface(host, {
          source: JSON.stringify({
            version: 1,
            id: 'stress-' + i,
            title: '压力测试',
            stateVersion: 1,
            kind: 'compare',
            before: { label: '前', lines: ['A'] },
            after: { label: '后', lines: ['B'] },
          }),
          scope: 'stress',
          instance: String(i),
          repository,
          draft: () => {},
          repair: () => {},
        }),
      );
    }
    Object.assign(window, {
      disposeStress: () => {
        for (const surface of surfaces) surface.dispose();
        container.remove();
      },
    });
  },
});

Object.assign(window, {
  mountGroup() {
    for (const [i, answerId] of ['one', 'one', 'other'].entries()) {
      const host = document.createElement('div');
      host.id = 'group-' + i;
      document.body.append(host);
      mountSurface(host, {
        source: JSON.stringify({
          version: 1,
          id: 'grammar-' + i,
          title: '课程',
          stateVersion: 1,
          kind: 'grammar',
          group: 'demo',
          grammar: { start: 'S', productions: [{ id: 's', lhs: 'S', rhs: ['a'] }] },
        }),
        scope: 'fixture',
        instance: 'group-' + i,
        answerId,
        repository,
        draft() {},
        repair() {},
      });
    }
  },
});

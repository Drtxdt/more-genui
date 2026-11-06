function createStepperAPI(read, save, report) {
  const mounts = new WeakMap();
  return Object.freeze({
    mount(container, { id, steps, scene }) {
      try {
        mounts.get(container)?.dispose();
        if (
          !(container instanceof HTMLElement) ||
          !id ||
          !Array.isArray(steps) ||
          !steps.length ||
          steps.length > 2048 ||
          steps.some((s) => typeof s?.title !== 'string' || typeof s.text !== 'string')
        )
          throw Error('分步演示需要 id 和 1–2048 个含 title、text 的步骤');
        if (scene) scene = FastValidation.validateView(scene);
        for (const step of steps) if (step.frame) FastValidation.validateView(step.frame);
        const key = JSON.stringify(scene ? { steps, scene } : steps);
        let hash = 2166136261;
        for (const c of key) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
        const old = read(id);
        let index =
            old?.hash === hash && Number.isInteger(old.index)
              ? Math.max(0, Math.min(old.index, steps.length - 1))
              : 0,
          timer;
        const text = document.createElement('p'),
          title = document.createElement('strong'),
          tools = document.createElement('div');
        text.setAttribute('role', 'status');
        tools.className = 'row';
        const graphic = document.createElement('div');
        container.replaceChildren(title, text, graphic, tools);
        let sceneRenderer;
        const pause = (e) => {
          if (e.detail === false) stop();
        };
        document.addEventListener('genui-visibility', pause);
        function button(label, fn) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = label;
          b.onclick = fn;
          tools.append(b);
          return b;
        }
        function stop() {
          clearInterval(timer);
          timer = null;
          play.textContent = '播放';
        }
        function draw() {
          title.textContent = index + 1 + '/' + steps.length + ' · ' + steps[index].title;
          text.textContent = steps[index].text;
          prev.disabled = index === 0;
          next.disabled = index === steps.length - 1;
          play.disabled = next.disabled;
          if (next.disabled) stop();
          sceneRenderer?.dispose();
          sceneRenderer = undefined;
          graphic.replaceChildren();
          if (steps[index].frame || scene)
            sceneRenderer = createFastRenderer(
              graphic,
              steps[index].frame || scene,
              () => ({}),
              () => {},
              report,
            );
          save(id, { index, hash });
        }
        const prev = button('上一步', () => {
            stop();
            index--;
            draw();
          }),
          next = button('下一步', () => {
            stop();
            index++;
            draw();
          });
        const play = button('播放', () => {
          if (timer) {
            stop();
            return;
          }
          play.textContent = '暂停';
          timer = setInterval(
            () => {
              if (document.hidden || !container.contains(play)) {
                stop();
                return;
              }
              index++;
              draw();
            },
            2000 / Number(speed.value),
          );
        });
        const speed = document.createElement('select');
        speed.setAttribute('aria-label', '速度');
        for (const n of [0.5, 1, 2]) speed.add(new Option(n + '×', String(n)));
        speed.value = '1';
        speed.onchange = () => {
          if (timer) {
            stop();
            play.click();
          }
        };
        tools.append(speed);
        button('重置', () => {
          stop();
          index = 0;
          draw();
        });
        draw();
        const api = {
          dispose() {
            stop();
            sceneRenderer?.dispose();
            document.removeEventListener('genui-visibility', pause);
            if (mounts.get(container) === api) {
              mounts.delete(container);
              container.replaceChildren();
            }
          },
        };
        mounts.set(container, api);
        return api;
      } catch (e) {
        report(e.message);
      }
    },
  });
}

function stepEntries(view) {
  const entries = new Map();
  const add = (id, label, value) => entries.set(JSON.stringify(id), {label, value});
  if (view?.kind === 'compare') {
    for (const side of ['before','after']) {
      view[side].lines.forEach((line,i) => add([side,i], view[side].label + ' · ' + (i+1), line));
    }
  } else if (view?.kind === 'matrix') {
    for (const c of view.cells) add([c.row,c.column], c.row+' / '+c.column,
      [c.text,c.conflict?'冲突':'',c.explanation].filter(Boolean).join(' · '));
  } else if (view?.kind === 'state-diagram') {
    for (const [kind,items] of [['节点',view.nodes],['边',view.edges]]) {
      for (const item of items) add([kind,item.id], kind+' '+item.id,
        [item.from && (item.from+' → '+item.to),item.label,item.explanation,view.highlight?.includes(item.id)?'高亮':''].filter(Boolean).join(' · '));
    }
  } else return null;
  return entries;
}
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
        const differences = document.createElement('div');
        graphic.after(differences);
        let comparing = false;
        let comparisonRenderers = [];
        function clearComparison() {
          for (const renderer of comparisonRenderers) renderer.dispose();
          comparisonRenderers = [];
          differences.replaceChildren();
        }
        function compareSteps() {
          clearComparison();
          compare.disabled = index === 0;
          compare.setAttribute('aria-pressed', String(comparing && index > 0));
          if (!comparing || !index) return;
          const pair = steps.slice(index-1,index+1);
          const views = pair.map(step => step.frame || scene);
          const [old, next] = views.map(stepEntries);
          if (old && next && views[0].kind === views[1].kind) {
            for (const id of new Set([...old.keys(),...next.keys()])) {
              const a=old.get(id), b=next.get(id);
              if (a?.value === b?.value) continue;
              const line = document.createElement('p');
              line.textContent = (b ?? a).label+'：'+(a?.value ?? '无')+' → '+(b?.value ?? '无');
              differences.append(line);
            }
            if (!differences.childElementCount) differences.textContent = '两步的图示内容相同';
            return;
          }
          differences.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:8px';
          pair.forEach((step,i) => {
            const section=document.createElement('section'), caption=document.createElement('strong'), block=document.createElement('div');
            caption.textContent=(i?'这一步 · ':'上一步 · ')+step.title;
            section.append(caption,block);
            differences.append(section);
            if (views[i]) comparisonRenderers.push(createFastRenderer(block,views[i],()=>({}),()=>{},report));
            else block.textContent=step.text;
          });
        }
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
          compareSteps();
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
        const compare = button('比较上一步', () => { stop(); comparing = !comparing; compareSteps(); });
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
            clearComparison();
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

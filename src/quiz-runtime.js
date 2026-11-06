function createQuizAPI(read, save, report) {
  const mounted = new Map();
  const validId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
  const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
  function validate(config) {
    if (!validId(config?.id)) throw Error('练习需要稳定的 id（字母、数字、下划线或短横线）');
    if (!Array.isArray(config.questions) || !config.questions.length) throw Error('练习缺少题目');
    const ids = new Set();
    return config.questions.map((q, index) => {
      const invalid = (reason) => {
        throw Error('第 ' + (index + 1) + ' 题（' + String(q?.id ?? '无 ID') + '）：' + reason);
      };
      if (!validId(q?.id) || ids.has(q.id)) invalid('题目 ID 缺失、无效或重复');
      ids.add(q.id);
      if (!hasText(q.prompt) || !hasText(q.explanation)) invalid('需要题干和解析');
      const type = q.type ?? 'single';
      if (!['single', 'multiple', 'number', 'order'].includes(type)) invalid('未知题型');
      if (type === 'number') {
        if (
          !Number.isFinite(q.correct) ||
          !Number.isFinite(q.tolerance ?? 0) ||
          (q.tolerance ?? 0) < 0 ||
          !hasText(q.hint)
        )
          invalid('数值题需要有限正确值、非负容差和提示');
        return {
          id: q.id,
          prompt: q.prompt,
          explanation: q.explanation,
          type,
          correct: q.correct,
          tolerance: q.tolerance ?? 0,
          unit: String(q.unit ?? ''),
          hint: q.hint,
        };
      }
      if (!Array.isArray(q.options) || q.options.length < 2) invalid('至少需要两个选项');
      if (type !== 'single') {
        if (
          !Array.isArray(q.correct) ||
          !q.correct.length ||
          new Set(q.correct).size !== q.correct.length ||
          !q.correct.every((id) => q.options.some((o) => o?.id === id)) ||
          (type === 'order' && q.correct.length !== q.options.length) ||
          !hasText(q.hint)
        )
          invalid('需要有效的正确选项列表和提示');
      } else if (!q.options.some((o) => o?.id === q.correct))
        invalid('正确答案必须指向一个选项 ID');
      const choices = new Set();
      const options = q.options.map((o) => {
        if (!validId(o?.id) || choices.has(o.id)) invalid('选项 ID 缺失、无效或重复');
        choices.add(o.id);
        if (!hasText(o.text)) invalid('选项缺少文字');
        if (type === 'single' && o.id !== q.correct && !hasText(o.hint))
          invalid('错误选项 ' + o.id + ' 缺少提示');
        return { id: o.id, text: o.text, hint: o.hint ?? '' };
      });

      return {
        ...(type === 'single' ? {} : { type, hint: q.hint }),
        id: q.id,
        prompt: q.prompt,
        options,
        correct: q.correct,
        explanation: q.explanation,
      };
    });
  }
  const element = (tag, text) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function mount(container, config) {
    try {
      if (!(container instanceof HTMLElement)) throw Error('挂载目标必须为 HTML 元素');
      const questions = validate(config);
      const previous = mounted.get(config.id);
      if (previous?.isConnected && previous !== container)
        throw Error('页面中有重复的练习 ID ' + config.id);
      mounted.set(config.id, container);
      // A compact content fingerprint leaves the state quota available for user data.
      let hash = 14695981039346656037n;
      for (const char of JSON.stringify(questions))
        hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0))) * 1099511628211n);
      const signature = hash.toString(16);
      let progress = { signature, index: 0, choice: null, phase: 'choose' };
      const stored = read(config.id);
      if (
        stored?.signature === signature &&
        Number.isInteger(stored.index) &&
        questions[stored.index] &&
        ['choose', 'hint', 'answer'].includes(stored.phase) &&
        (stored.choice == null ||
          ['string', 'number'].includes(typeof stored.choice) ||
          Array.isArray(stored.choice))
      )
        progress = { ...stored };
      const first = progress.first ?? Object.create(null);
      if (stored?.signature === signature && !stored.first) {
        for (let i = 0; i < progress.index + (progress.phase === 'choose' ? 0 : 1); i++)
          first[questions[i].id] = null;
      }
      function update(change) {
        progress = { ...progress, ...change };
        progress.first = first;
        save(config.id, progress);
      }
      function draw(focus = false) {
        const q = questions[progress.index],
          sequence = progress.review ?? questions.map((_, i) => i),
          position = sequence.indexOf(progress.index),
          last = position === sequence.length - 1;
        const group = element('fieldset'),
          title = element(
            'legend',
            (questions.length > 1
              ? '第 ' + (progress.index + 1) + '/' + questions.length + ' 题 · '
              : '') + q.prompt,
          );
        group.style.cssText = 'border:0;margin:0;padding:0;min-width:0';
        title.style.cssText = 'font-weight:600;padding:0;margin-bottom:.5em';
        title.tabIndex = -1;
        group.append(title);
        const feedback = element('p');
        feedback.setAttribute('role', 'status');
        const actions = element('div');
        actions.className = 'row';
        function button(text, action) {
          const b = element('button', text);
          b.type = 'button';
          b.onclick = action;
          actions.append(b);
          return b;
        }
        let submit,
          choice = progress.choice;
        const editable = progress.phase === 'choose';
        const options = q.options ?? [];
        const values = () => (Array.isArray(choice) ? choice : []);
        const valid = () =>
          q.type === 'number'
            ? choice !== null && String(choice).trim() !== '' && Number.isFinite(Number(choice))
            : q.type === 'multiple'
              ? values().length > 0
              : choice !== null;
        const set = (value) => {
          choice = value;
          update({ choice: value });
          if (submit) submit.disabled = !valid();
        };
        const correct = () => {
          if (q.type === 'number')
            return (
              Math.abs(Number(choice) - q.correct) <=
              q.tolerance + Number.EPSILON * Math.abs(q.correct)
            );
          if (q.type === 'order')
            return (
              values().every((v, i) => v === q.correct[i]) && values().length === q.correct.length
            );
          if (q.type === 'multiple')
            return (
              values().length === q.correct.length && q.correct.every((v) => values().includes(v))
            );
          return choice === q.correct;
        };
        if (q.type === 'number') {
          const label = element(
            'label',
            '答案' + (q.unit ? '（' + q.unit + '）' : '') + '，容差 ±' + q.tolerance + ' ',
          );
          const input = element('input');
          input.type = 'number';
          input.step = 'any';
          input.value = choice ?? '';
          input.disabled = !editable;
          input.oninput = () => set(input.value);
          label.append(input);
          group.append(label);
        } else if (q.type === 'order') {
          if (!Array.isArray(choice)) choice = options.map((o) => o.id);
          choice.forEach((id, i) => {
            const row = element('div', options.find((o) => o.id === id).text + ' ');
            for (const [label, offset] of [
              ['上移', -1],
              ['下移', 1],
            ]) {
              const b = element('button', label);
              b.type = 'button';
              const dest = i + offset;
              b.disabled = !editable || dest < 0 || dest >= choice.length;
              b.onclick = () => {
                const next = [...choice];
                [next[i], next[dest]] = [next[dest], next[i]];
                set(next);
                draw();
                group.parentElement?.focus();
                container.querySelectorAll('[data-order]')[dest]?.focus();
              };
              row.append(b);
            }
            row.tabIndex = -1;
            row.dataset.order = '';
            group.append(row);
          });
        } else
          for (const o of options) {
            const label = element('label'),
              input = element('input');
            input.type = q.type === 'multiple' ? 'checkbox' : 'radio';
            input.name = 'quiz-' + config.id;
            input.checked = q.type === 'multiple' ? values().includes(o.id) : choice === o.id;
            input.disabled = !editable;
            input.onchange = () =>
              set(
                q.type === 'multiple'
                  ? input.checked
                    ? [...values(), o.id]
                    : values().filter((v) => v !== o.id)
                  : o.id,
              );
            label.append(input, document.createTextNode(' ' + o.text));
            group.append(label);
          }
        if (editable) {
          submit = button('提交', () => {
            if (!Object.hasOwn(first, q.id))
              Object.defineProperty(first, q.id, {
                value: { answer: choice, correct: correct() },
                enumerable: true,
                configurable: true,
              });
            update({ choice, phase: correct() ? 'answer' : 'hint' });
            draw(true);
          });
          submit.disabled = !valid();
        } else if (progress.phase === 'hint') {
          feedback.textContent = q.hint ?? options.find((o) => o.id === choice)?.hint;
          button('再试一次', () => {
            update({ choice: null, phase: 'choose' });
            draw(true);
          });
          button('查看解析', () => {
            update({ phase: 'answer' });
            draw(true);
          });
        } else {
          const solution =
            q.type === 'number'
              ? q.correct + ' ' + q.unit
              : (Array.isArray(q.correct) ? q.correct : [q.correct])
                  .map((id) => options.find((o) => o.id === id).text)
                  .join(q.type === 'order' ? ' → ' : '、');
          feedback.textContent =
            (last ? '已完成。' : '') + '正确答案是「' + solution + '」。' + q.explanation;
          if (last) {
            const recorded = Object.values(first).filter(Boolean);
            feedback.append(
              document.createTextNode(
                ' 首答正确 ' +
                  recorded.filter((x) => x.correct).length +
                  '/' +
                  recorded.length +
                  '，未记录 ' +
                  (questions.length - recorded.length) +
                  ' 题。',
              ),
            );
            const wrong = questions
              .map((_, i) => i)
              .filter(
                (i) =>
                  Object.hasOwn(first, questions[i].id) &&
                  first[questions[i].id]?.correct === false,
              );
            if (wrong.length)
              button('只练错题', () => {
                update({ index: wrong[0], review: wrong, choice: null, phase: 'choose' });
                draw(true);
              });
          }
          button(last ? '重新开始' : '下一题', () => {
            if (last) {
              for (const key of Object.keys(first)) delete first[key];
            }
            update({
              index: last ? 0 : sequence[position + 1],
              review: last ? undefined : progress.review,
              phase: 'choose',
              choice: null,
            });
            draw(true);
          });
        }
        container.replaceChildren(group, feedback, actions);
        if (focus) {
          const target = progress.phase === 'choose' ? title : feedback;
          target.tabIndex = -1;
          target.focus();
        }
      }
      draw();
    } catch (error) {
      const message = '练习配置错误：' + error.message;
      if (container instanceof HTMLElement) container.replaceChildren(element('p', message));
      report(message);
    }
  }
  return Object.freeze({ mount });
}

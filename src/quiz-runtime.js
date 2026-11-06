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
      if (!Array.isArray(q.options) || q.options.length < 2) invalid('至少需要两个选项');
      if (!q.options.some((o) => o?.id === q.correct)) invalid('正确答案必须指向一个选项 ID');
      const choices = new Set();
      const options = q.options.map((o) => {
        if (!validId(o?.id) || choices.has(o.id)) invalid('选项 ID 缺失、无效或重复');
        choices.add(o.id);
        if (!hasText(o.text)) invalid('选项缺少文字');
        if (o.id !== q.correct && !hasText(o.hint)) invalid('错误选项 ' + o.id + ' 缺少提示');
        return { id: o.id, text: o.text, hint: o.hint ?? '' };
      });

      return {
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
        (questions[stored.index].options.some((o) => o.id === stored.choice) ||
          (stored.phase === 'choose' && stored.choice === null))
      )
        progress = { ...stored };
      function update(change) {
        progress = { ...progress, ...change };
        save(config.id, progress);
      }
      function draw(focus = false) {
        const q = questions[progress.index],
          last = progress.index === questions.length - 1;
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
        let submit;
        for (const option of q.options) {
          const label = element('label'),
            radio = element('input');
          radio.type = 'radio';
          radio.name = 'quiz-' + config.id;
          radio.value = option.id;
          radio.checked = option.id === progress.choice;
          radio.disabled = progress.phase !== 'choose';
          radio.onchange = () => {
            update({ choice: option.id });
            submit.disabled = false;
          };
          label.append(radio, document.createTextNode(' ' + option.text));
          group.append(label);
        }
        if (progress.phase === 'choose') {
          submit = button('提交', () => {
            update({ phase: progress.choice === q.correct ? 'answer' : 'hint' });
            draw(true);
          });
          submit.disabled = progress.choice === null;
        } else if (progress.phase === 'hint') {
          feedback.textContent = q.options.find((o) => o.id === progress.choice).hint;
          button('再试一次', () => {
            update({ choice: null, phase: 'choose' });
            draw(true);
          });
          button('查看解析', () => {
            update({ phase: 'answer' });
            draw(true);
          });
        } else {
          feedback.textContent =
            (last ? '已完成。' : '') +
            '正确答案是「' +
            q.options.find((o) => o.id === q.correct).text +
            '」。' +
            q.explanation;
          button(last ? '重新开始' : '下一题', () => {
            update({ index: last ? 0 : progress.index + 1, phase: 'choose', choice: null });
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

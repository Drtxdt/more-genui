export function readerIndex() {
  const entries = new Map(),
    panel = document.createElement('details');
  panel.className = 'more-genui-index';
  panel.style.cssText =
    'position:fixed;bottom:18px;right:66px;z-index:9999;background:Canvas;color:CanvasText;padding:4px 8px;max-width:min(80vw,340px);max-height:50vh;overflow:auto';
  const summary = document.createElement('summary'),
    list = document.createElement('div');
  summary.textContent = '本对话图解';
  panel.append(summary, list);
  function locate(entry) {
    if (entry.host?.isConnected) {
      panel.open = false;
      entry.host.scrollIntoView({ block: 'center' });
      entry.host.focus({ preventScroll: true });
    } else {
      entry.pending = true;
      entry.scroller?.scrollTo({ top: entry.top });
      summary.textContent = '正在定位 ' + entry.title;
      setTimeout(() => {
        if (entry.pending) {
          entry.pending = false;
          summary.textContent = '暂未定位，请展开原回答后重试';
        }
      }, 2000);
    }
  }
  return {
    register(key, title, host) {
      const entry = entries.get(key) ?? {};
      let parent = host.parentElement;
      while (
        parent &&
        !(
          /auto|scroll/.test(getComputedStyle(parent).overflowY) &&
          parent.scrollHeight > parent.clientHeight
        )
      )
        parent = parent.parentElement;
      const scroller = parent ?? document.scrollingElement;
      host.tabIndex = -1;
      Object.assign(entry, {
        title,
        host,
        scroller,
        top:
          scroller.scrollTop +
          host.getBoundingClientRect().top -
          (parent?.getBoundingClientRect().top ?? 0),
      });
      if (!entries.has(key)) {
        const button = document.createElement('button');
        button.textContent = title;
        button.style.display = 'block';
        button.onclick = () => locate(entry);
        list.append(button);
        entries.set(key, entry);
        document.body.append(panel);
      }
      if (entry.pending) {
        entry.pending = false;
        summary.textContent = '本对话图解';
        locate(entry);
      }
    },
    detach(host) {
      for (const entry of entries.values()) if (entry.host === host) entry.host = null;
    },
    clear() {
      entries.clear();
      panel.remove();
      list.replaceChildren();
      panel.open = false;
      summary.textContent = '本对话图解';
    },
  };
}

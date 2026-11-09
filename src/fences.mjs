// Incremental line scanner. Rewrites reset parsing; append updates scan only the tail.
export class FenceScanner {
  previous = '';
  pending = '';
  fence = '';
  language = '';
  declared = false;
  candidate = false;
  lines = [];
  constructor(onSource) {
    this.onSource = onSource;
  }
  update(text, appendOnly = false) {
    if (!appendOnly && !text.startsWith(this.previous)) {
      this.declared = this.candidate = false;
      this.previous = '';
      this.pending = '';
      this.fence = '';
      this.lines = [];
    }
    this.pending += text.slice(this.previous.length);
    this.previous = text;
    let end;
    while ((end = this.pending.indexOf('\n')) >= 0) {
      this.line(this.pending.slice(0, end).replace(/\r$/, ''));
      this.pending = this.pending.slice(end + 1);
    }
  }
  finish() {
    if (this.fence && this.closes(this.pending)) {
      this.line(this.pending);
      this.pending = '';
    }
  }
  get explicit() { return ['genui-html', 'genui-json'].includes(this.language); }
  closes(line) {
    return new RegExp('^\\s{0,3}' + this.fence[0] + '{' + this.fence.length + ',}\\s*$').test(line);
  }
  line(line) {
    if (!this.fence) {
      const match = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (match && !(match[1][0] === '`' && match[2].includes('`'))) {
        this.language = match[2].trim();
        if (this.explicit) this.declared = true;
        this.fence = match[1];
        this.lines = [];
      }
    } else if (this.closes(line)) {
      const source = this.lines.join('\n');
      if (this.explicit) this.onSource(source, this.language);
      else if (['html','json',''].includes(this.language) && (/^\s*<!--\s*more-genui:/.test(source) || (/^\s*\{/.test(source) && source.includes('"stateVersion"')))) this.candidate = true;
      this.language = '';
      this.fence = '';
      this.lines = [];
    } else this.lines.push(line);
  }
}

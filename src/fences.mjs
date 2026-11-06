// Incremental line scanner. Rewrites reset parsing; append updates scan only the tail.
export class FenceScanner {
  previous = '';
  pending = '';
  fence = '';
  lines = [];
  constructor(onSource) {
    this.onSource = onSource;
  }
  update(text, appendOnly = false) {
    if (!appendOnly && !text.startsWith(this.previous)) {
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
  closes(line) {
    return new RegExp('^\\s{0,3}' + this.fence[0] + '{' + this.fence.length + ',}\\s*$').test(line);
  }
  line(line) {
    if (!this.fence) {
      const match = /^\s{0,3}(`{3,}|~{3,})genui-html\s*$/.exec(line);
      if (match) {
        this.fence = match[1];
        this.lines = [];
      }
    } else if (this.closes(line)) {
      this.onSource(this.lines.join('\n'));
      this.fence = '';
      this.lines = [];
    } else this.lines.push(line);
  }
}

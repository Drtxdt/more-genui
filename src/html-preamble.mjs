// DeepSeek can render the two protocol comments immediately before an explicit fence.
const metadata = /^<!-- more-genui: \{[^\n]*\} -->$/;
const proof = /^<!-- more-genui-request: [a-f0-9-]{36} -->$/;

export function advancePreamble(lines, line) {
  const value = line.trim();
  if (!value) return lines;
  if (metadata.test(value)) return [value];
  if (lines.length === 1 && proof.test(value)) return [...lines, value];
  return [];
}

export function withPreamble(source, language, lines) {
  return language === 'genui-html' && lines.length && /^\s*(?:<!doctype html>|<html[\s>])/i.test(source)
    ? [...lines, source].join('\n')
    : source;
}

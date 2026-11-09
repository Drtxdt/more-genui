const comment =
  /^(\s*<!-- more-genui: [^\n]*?-->\s*)<!-- more-genui-request: ([a-f0-9-]{36}) -->\s*/;
export function readProof(source) {
  try {
    return source.trimStart().startsWith('{')
      ? JSON.parse(source).requestProof
      : comment.exec(source)?.[2];
  } catch {
    return undefined;
  }
}
export function stripRequestProof(source) {
  if (!readProof(source)) return source;
  if (!source.trimStart().startsWith('{')) return source.replace(comment, '$1');
  const spec = JSON.parse(source);
  delete spec.requestProof;
  return JSON.stringify(spec, null, 2);
}

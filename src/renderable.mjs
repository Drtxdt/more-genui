import { parseApp } from './protocol.mjs';
import { parseFast } from './fast-schema.mjs';
export function parseRenderable(source, format) {
  return format === 'fast' || (!format && source.trimStart().startsWith('{'))
    ? parseFast(source)
    : { ...parseApp(source), spec: undefined };
}

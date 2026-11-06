import { publicURL, representativeImage } from './search-sources.mjs';
async function download(url, limit, type, signal) {
  if (!publicURL(url)) throw Error('Unsupported URL');
  const res = await fetch(url, {
    signal,
    targetAddressSpace: 'public',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    redirect: 'error',
    cache: 'no-store',
  });
  if (
    !res.ok ||
    !type.test(res.headers.get('content-type') ?? '') ||
    Number(res.headers.get('content-length')) > limit
  ) {
    await res.body?.cancel();
    throw Error('Unsupported response');
  }
  const reader = res.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw Error('Too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks, { type: res.headers.get('content-type').split(';')[0] });
}
async function thumbnail(url, signal) {
  if (!url || /(?:favicon|wordmark|(?:^|[/_-])logo(?:[._/-]|$))/i.test(new URL(url).pathname))
    return;
  const blob = await download(url, 2097152, /^image\/(?:png|jpeg|webp|avif|gif)\b/i, signal);
  const image = await createImageBitmap(blob);
  try {
    if (image.width < 120 || image.height < 72 || image.width / image.height > 5) return;
    const scale = Math.min(1, 320 / image.width, 240 / image.height);
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(image.width * scale)),
      Math.max(1, Math.round(image.height * scale)),
    );
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const bytes = new Uint8Array(
      await (await canvas.convertToBlob({ type: 'image/webp', quality: 0.78 })).arrayBuffer(),
    );
    return (
      'data:image/webp;base64,' + btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
    );
  } finally {
    image.close();
  }
}
export async function imageFor(source, signal) {
  if (source.image) {
    const result = await thumbnail(source.image, signal).catch(() => null);
    if (result) return result;
  }
  const page = await download(source.url, 512 * 1024, /^text\/html\b/i, signal);
  return thumbnail(representativeImage(await page.text(), source.url), signal);
}

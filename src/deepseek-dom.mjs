// Keep site-private DOM assumptions here. Unknown ownership is left untouched.
const excluded =
  '.more-genui-surface,.more-genui-guidance,.more-genui-recovery,nav,aside,[role=tooltip],._72b6158';
export function messages(root = document) {
  return [...root.querySelectorAll('.ds-message')].filter((node) => !node.closest(excluded));
}
export function codeBlocks(root) {
  return [...root.querySelectorAll('.ds-assistant-message-main-content pre')]
    .filter((node) => !node.closest(excluded))
    .map((pre) => pre.querySelector('code') ?? pre);
}
export function userLeaves(root) {
  return [...root.querySelectorAll('p,div')].filter(
    (node) =>
      !node.closest(excluded + ',.ds-assistant-message-main-content,.ds-think-content') &&
      node.children.length === 0,
  );
}
const temporary = new WeakMap();
export function messageIdentity(code) {
  const message = code.closest('[data-virtual-list-item-key]') ?? code.closest('.ds-message');
  const stable = message?.getAttribute('data-virtual-list-item-key');
  if (stable) return { message, id: stable, persistent: true };
  if (!temporary.has(message)) temporary.set(message, crypto.randomUUID());
  return { message, id: temporary.get(message), persistent: false };
}

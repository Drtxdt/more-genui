const mode = document.querySelector<HTMLSelectElement>('#mode')!;
chrome.storage.local
  .get(['enabled', 'generationMode'])
  .then((v) => (mode.value = v.enabled === false ? 'off' : String(v.generationMode ?? 'auto')));
mode.onchange = () => {
  if (mode.value === 'off') void chrome.storage.local.set({ enabled: false });
  else void chrome.storage.local.set({ enabled: true, generationMode: mode.value });
};
const sources = document.querySelector<HTMLSelectElement>('#sources')!;
chrome.storage.local.get(['sourceMode', 'previewImages']).then((value) => {
  sources.value = String(value.sourceMode ?? (value.previewImages === true ? 'images' : 'text'));
  sources.disabled = false;
});
const permissionStatus = document.querySelector<HTMLParagraphElement>('#permission-status')!;
sources.onchange = async () => {
  permissionStatus.textContent = '';
  if (sources.value === 'images') {
    const granted = await chrome.permissions
      .request({ origins: ['https://*/*'] })
      .catch(() => false);
    if (!granted) {
      permissionStatus.textContent = '未获得来源网站授权，继续使用文字来源。';
      sources.value = 'text';
      await chrome.storage.local.set({ sourceMode: 'text', previewImages: false });
      return;
    }
  }
  await chrome.storage.local.set({
    sourceMode: sources.value,
    previewImages: sources.value === 'images',
  });
};
document.querySelector<HTMLButtonElement>('#revoke')!.onclick = async () => {
  sources.value = 'text';
  await chrome.storage.local.set({ sourceMode: 'text', previewImages: false });
  try {
    await chrome.permissions.remove({ origins: ['https://*/*'] });
    const remains = await chrome.permissions.contains({ origins: ['https://*/*'] });
    permissionStatus.textContent = remains
      ? '已关闭图文，请在浏览器扩展设置中核对网站授权。'
      : '已关闭图文，额外网站授权已撤销。';
  } catch {
    permissionStatus.textContent = '已关闭图文，请在浏览器扩展设置中核对网站授权。';
  }
};
const diagnostic = document.querySelector<HTMLInputElement>('#diagnostics')!;
void chrome.storage.local
  .get('diagnostics')
  .then((v) => (diagnostic.checked = v.diagnostics === true));
diagnostic.onchange = () => void chrome.storage.local.set({ diagnostics: diagnostic.checked });

const lab = document.querySelector<HTMLInputElement>('#lab-policy')!;
void chrome.storage.local.get('labPolicy').then((v) => (lab.checked = v.labPolicy === 'B'));
lab.onchange = () => void chrome.storage.local.set({ labPolicy: lab.checked ? 'B' : 'A' });

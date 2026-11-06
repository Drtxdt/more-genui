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
  sources.value = String(value.sourceMode ?? (value.previewImages === false ? 'text' : 'images'));
  sources.disabled = false;
});
sources.onchange = () =>
  chrome.storage.local.set({
    sourceMode: sources.value,
    previewImages: sources.value === 'images',
  });

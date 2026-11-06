const input = document.querySelector('input')!;
chrome.storage.local.get('previewImages').then(value => {
  input.checked = value.previewImages !== false;
  input.disabled = false;
});
input.onchange = () => chrome.storage.local.set({ previewImages: input.checked });

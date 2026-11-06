const sources = document.querySelector<HTMLSelectElement>('#sources')!;
chrome.storage.local.get(['sourceMode','previewImages']).then(value=>{
  sources.value=value.sourceMode??(value.previewImages===false?'text':'images');sources.disabled=false;
});
sources.onchange=()=>chrome.storage.local.set({sourceMode:sources.value,previewImages:sources.value==='images'});

import {test, expect} from '@playwright/test';
test('HTML cannot execute a blob worker even after removing the policy element', async ({page})=>{
  await page.goto('/');
  const source = '<!-- more-genui: {"version":1,"id":"worker","title":"Worker","stateVersion":1} --><html><body><output>waiting</output><script>document.querySelectorAll("meta").forEach(m=>m.remove()); const out=document.querySelector("output");try{const w=new Worker(URL.createObjectURL(new Blob(["postMessage(1)"],{type:"text/javascript"})));w.onmessage=()=>out.textContent="ran";w.onerror=e=>{e.preventDefault();out.textContent="blocked"}}catch{out.textContent="blocked"}</script></body></html>';
  await page.evaluate(s=>window.show('worker',s),source);
  await expect(page.frameLocator('#app iframe').locator('output')).toHaveText('blocked');
});

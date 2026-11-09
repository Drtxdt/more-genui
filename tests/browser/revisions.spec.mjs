import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test('a meal quantity edit can be undone and redone in the reader toolbar',async({page})=>{
 await page.goto('/');
 const source=await readFile('examples/models/roast.json','utf8');
 await page.evaluate(s=>window.show('undo-meal',s),source);
 const slider=page.frameLocator('#app iframe').getByRole('slider');
 await slider.focus();await slider.press('ArrowRight');await expect(slider).toHaveValue('5');
 const undo=page.getByRole('button',{name:'撤销编辑'});
 if(!await undo.isVisible())await page.getByRole('button',{name:'更多',exact:true}).click();
 await undo.click();await expect(slider).toHaveValue('4');
 await page.getByRole('button',{name:'重做编辑'}).click();await expect(slider).toHaveValue('5');
 await page.getByRole('button',{name:'易读模式'}).click();
 await expect(page.getByRole('button',{name:'易读模式'})).toHaveAttribute('aria-pressed','true');
});

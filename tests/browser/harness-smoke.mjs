import './environment.mjs';
import {chromium} from '@playwright/test';import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[],assets=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.url().includes('more-genui'))assets.push({path:new URL(r.url()).pathname,status:r.status()})});
await page.goto(process.env.DSH_TEST_URL,{waitUntil:'networkidle'});await page.locator('body').waitFor();if(await page.getByText('继续',{exact:true}).count())await page.getByText('继续',{exact:true}).click();await page.screenshot({path:'docs/evidence/harness-loaded.png',fullPage:true});
const result={text:(await page.locator('body').innerText()).slice(-2500),errors,assets};await writeFile('docs/evidence/harness-smoke.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();if(errors.length)process.exitCode=1;


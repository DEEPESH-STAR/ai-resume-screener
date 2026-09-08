// Opt-in tests with REAL network downloads and actual AI inference. No mocks.
import {test,before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium,firefox,webkit} from 'playwright';
const enabled=process.env.RUN_LIVE==='1';
const root=fileURLToPath(new URL('../',import.meta.url));
const browserName=process.env.TEST_BROWSER||'chromium';
let browser,server,context,page,origin,errors;
const live=(name,fn,timeout=180000)=>test(name,{skip:!enabled,timeout},fn);
before(async()=>{
  if(!enabled)return;
  execFileSync('python3',[path.join(root,'tests/make-fixtures.py')]);
  await mkdir(path.join(root,'test-results'),{recursive:true});
  server=createServer(async(req,res)=>{
    try{
      const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
      if(!file.startsWith(root)){res.writeHead(403).end();return;}
      const data=await readFile(file);
      res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream'}).end(data);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin=`http://127.0.0.1:${server.address().port}`;
  const engine={chromium,firefox,webkit}[browserName];
  if(!engine)throw new Error(`Unsupported TEST_BROWSER: ${browserName}`);
  const executable=browserName==='chromium'?(process.env.CHROMIUM_PATH||(existsSync('/usr/local/bin/chromium')?'/usr/local/bin/chromium':undefined)):undefined;
  browser=await engine.launch({headless:true,...(executable?{executablePath:executable}:{}),...(browserName==='chromium'?{args:['--no-sandbox']}:{})});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
beforeEach(async()=>{
  if(!enabled)return;
  context=await browser.newContext({viewport:{width:1280,height:900}});
  page=await context.newPage();page.setDefaultTimeout(90000);errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
});
afterEach(async(t)=>{
  if(!enabled||!context)return;
  if(t.error)await page?.screenshot({path:path.join(root,'test-results',`live-${browserName}-${t.name.replace(/[^a-z0-9]/gi,'-').slice(0,80)}.png`),fullPage:true}).catch(()=>{});
  await context.close();assert.deepEqual(errors,[],'No unhandled browser errors');
});
async function imported(name){
  await page.setInputFiles('#files',path.join(root,'tests/fixtures',name));
  await page.waitForFunction(()=>!document.querySelector('#files').disabled);
  return page.textContent('#message');
}
for(const extension of ['pdf','docx'])live(`real ${extension.toUpperCase()} fixture imports and produces exact evidence`,async()=>{
  await page.fill('#requirements','Python, SQL, React, TypeScript, Testing, Git');
  const result=await imported(`resume.${extension}`);assert.match(result,/1 resume\(s\) added/);
  await page.click('#run');await page.locator('.review-card').waitFor();
  assert.equal(await page.locator('.coverage strong').textContent(),'6/6');
  await page.locator('.card-details summary').click();assert.match(await page.locator('.card-details').innerText(),/Built Python services and SQL data pipelines/);
});
live('real PDF reader rejects a document with no extractable text',async()=>{
  assert.match(await imported('no-text.pdf'),/at least 30 characters/);
  assert.equal(await page.locator('#candidate-list li').count(),0);
});
live('real PDF reader enforces the 30-page limit',async()=>{
  assert.match(await imported('too-many-pages.pdf'),/at most 30 pages/);
  assert.equal(await page.locator('#candidate-list li').count(),0);
});
live('real PDF reader recovers after a malformed document',async()=>{
  assert.match(await imported('malformed.pdf'),/0 resume\(s\) added/);
  assert.match(await imported('resume.pdf'),/1 resume\(s\) added/);
});
live('real local AI downloads and completes a browser review',async()=>{
  await page.click('#enable-ai');await page.click('#confirm-ai');
  await page.waitForFunction(()=>/AI enabled|AI unavailable|could not start/.test(document.querySelector('#message').textContent),null,{timeout:330000});
  assert.match(await page.textContent('#ai-status'),/Local AI ready/);
  await page.click('#demo');await page.locator('.review-card').first().waitFor({timeout:180000});
  assert.equal(await page.locator('.review-card').count(),3);
  assert.match(await page.textContent('#workspace-label'),/AI-assisted review/);
  assert.deepEqual(await page.locator('.coverage strong').allTextContents(),['6/6','3/6','2/6']);
},600000);
live('real AI worker returns finite similarities and verbatim source passages',async()=>{
  const text='Designed keyboard navigation and screen reader labels for web interfaces.\nBuilt Python data pipelines.';
  const rows=await page.evaluate(async text=>{
    const worker=new Worker('./ai-worker.js',{type:'module'});
    try{
      const request=(id,type,body={})=>new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Real worker request timed out')),300000);
        worker.onmessage=({data})=>{if(data.id!==id||data.progress)return;clearTimeout(timer);data.error?reject(new Error(data.error)):resolve(data.result);};
        worker.onerror=e=>{clearTimeout(timer);reject(new Error(e.message));};worker.postMessage({id,type,...body});
      });
      await request(1,'load');return await request(2,'analyze',{text,skills:['Accessibility','Python']});
    }finally{worker.terminate();}
  },text);
  assert.equal(rows.length,2);
  for(const row of rows){assert.ok(Number.isFinite(row.similarity));assert.ok(row.similarity>=-1.001&&row.similarity<=1.001);assert.ok(text.includes(row.related));assert.ok(row.related.length>0);}
},600000);

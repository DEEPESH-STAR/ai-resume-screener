import {test,before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium,firefox,webkit} from 'playwright';
const browserName=process.env.TEST_BROWSER||'chromium';

const root=fileURLToPath(new URL('../',import.meta.url));
let server,browser,context,page,origin,errors;
const localChromium=process.env.CHROMIUM_PATH || (existsSync('/usr/local/bin/chromium')?'/usr/local/bin/chromium':undefined);
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json'};

before(async()=>{
  await mkdir(path.join(root,'test-results'),{recursive:true});
  server=createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const relative=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');
      const file=path.resolve(root,relative);
      if(!file.startsWith(root)){res.writeHead(403).end();return;}
      const data=await readFile(file);
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);
    }catch{res.writeHead(404).end('Not found');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin=`http://127.0.0.1:${server.address().port}`;
  const engine={chromium,firefox,webkit}[browserName];
  if(!engine)throw new Error(`Unsupported TEST_BROWSER: ${browserName}`);
  browser=await engine.launch({headless:true,...(browserName==='chromium'&&localChromium?{executablePath:localChromium}:{}),...(browserName==='chromium'?{args:['--no-sandbox']}:{})});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
beforeEach(async()=>{
  context=await browser.newContext({viewport:{width:1360,height:1000},colorScheme:'light',acceptDownloads:true});
  await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  page=await context.newPage();page.setDefaultTimeout(6000);errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.locator('#demo').waitFor();
});
afterEach(async()=>{const captured=errors;await context.close();assert.deepEqual(captured,[],'No unhandled JavaScript errors');});
async function sample(){await page.click('#demo');await page.locator('.review-card').first().waitFor();}
async function addResume(text='Built React interfaces and accessible web applications using TypeScript.',label='Test candidate'){
  await page.locator('#paste-details').evaluate(el=>el.open=true);
  await page.fill('#candidate',label);await page.fill('#resume',text);await page.click('#add');
}
async function notice(pattern){await page.waitForFunction(p=>new RegExp(p).test(document.querySelector('#message').textContent),pattern.source);}
async function count(selector,value){assert.equal(await page.locator(selector).count(),value);}
async function mockAI(mode='success'){
  // Contract test only: no real model is downloaded and no real inference occurs.
  await page.evaluate(mode=>{
    window.Worker=class{
      constructor(){this.stopped=false;}
      postMessage(data){setTimeout(()=>{
        if(this.stopped)return;
        if(mode==='error')this.onmessage?.({data:{id:data.id,error:'Simulated model download failure'}});
        else this.onmessage?.({data:{id:data.id,result:data.type==='load'?true:data.skills.map(()=>({related:'Improved keyboard navigation and labels for screen readers.',similarity:0.62}))}});
      },mode==='slow'?300:10);}
      terminate(){this.stopped=true;}
    };
  },mode);
}
async function enableAI(){await page.click('#enable-ai');await page.click('#confirm-ai');await notice(/AI enabled/);}

test('initial workspace is empty, exports disabled, privacy guidance visible',async()=>{
  await count('.review-card',0);assert.equal(await page.locator('#export').isDisabled(),true);
  assert.equal(await page.textContent('#stat-resumes'),'0');
  assert.match(await page.textContent('body'),/Files stay on your device/);
});
test('sample review produces three candidates in input order with expected mention counts',async()=>{
  await sample();assert.deepEqual(await page.locator('.identity h3').allTextContents(),['Candidate 01 · Sample','Candidate 02 · Sample','Candidate 03 · Sample']);
  assert.deepEqual(await page.locator('.coverage strong').allTextContents(),['6/6','3/6','2/6']);
  assert.match(await page.textContent('#workspace-label'),/Fictional sample/);
  assert.equal(await page.locator('#export').isDisabled(),false);
  const html=(await page.content()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  await writeFile(path.join(root,'test-results','sample-desktop.html'),html);
});
test('evidence detail reveals exact quotes and gaps, without hiring verdicts',async()=>{
  await sample();await page.locator('.card-details summary').nth(1).click();
  const detail=await page.locator('.card-details').nth(1).innerText();
  assert.match(detail,/Built responsive React interfaces/);assert.match(detail,/No explicit mention found/);
  assert.doesNotMatch(detail,/recommended hire|reject candidate/i);
});
test('human-review checkbox updates reviewed count',async()=>{
  await sample();await page.locator('.review-note input').first().check();assert.equal(await page.textContent('#stat-reviewed'),'1');
  await page.locator('.review-note input').first().uncheck();assert.equal(await page.textContent('#stat-reviewed'),'0');
});
test('editing requirements invalidates prior results and export',async()=>{
  await sample();await page.fill('#requirements','Python, SQL');await count('.review-card',0);
  assert.equal(await page.locator('#export').isDisabled(),true);await page.click('#run');await count('.review-card',3);
  assert.equal(await page.textContent('#stat-skills'),'2');
});
test('pasted resume is added and produces correct evidence',async()=>{
  await page.fill('#requirements','React, TypeScript, SQL');await addResume();await page.click('#run');
  assert.equal(await page.locator('.coverage strong').textContent(),'2/3');
  assert.equal(await page.locator('#candidate').inputValue(),'');assert.equal(await page.locator('#resume').inputValue(),'');
});
test('empty criteria and missing resumes produce actionable validation',async()=>{
  await page.click('#run');await notice(/at least one job-related skill/);
  await page.fill('#requirements','React');await page.click('#run');await notice(/Add at least one resume/);
});
test('short pasted resume is rejected without adding a candidate',async()=>{
  await addResume('Too short');await notice(/at least 30 characters/);await count('#candidate-list li',0);
});
test('overlong pasted resume is rejected',async()=>{
  await page.locator('#paste-details').evaluate(el=>el.open=true);
  await page.locator('#resume').evaluate(el=>el.value='x'.repeat(40001));await page.click('#add');
  await notice(/40,000 characters/);await count('#candidate-list li',0);
});
test('protected criteria and excess skills block review',async()=>{
  await addResume();await page.fill('#requirements','age, gender');await page.click('#run');await notice(/protected characteristics/);
  await page.fill('#requirements',Array.from({length:13},(_,i)=>`Skill ${i}`).join(','));await page.click('#run');await notice(/up to 12/);
});
test('dictionary extraction suggests skills and discloses rules-based mode',async()=>{
  await page.fill('#jd','Build React apps with TypeScript and WCAG accessibility.');await page.click('#extract');
  assert.match(await page.inputValue('#requirements'),/React/);assert.match(await page.inputValue('#requirements'),/Accessibility/);
  await notice(/keyword dictionary, not AI/);
});
test('plain-text upload works end to end and uses an anonymous label',async()=>{
  await page.fill('#requirements','Python, SQL');
  await page.setInputFiles('#files',{name:'private-name.txt',mimeType:'text/plain',buffer:Buffer.from('Built Python services and SQL pipelines for an inventory project.')});
  await notice(/1 resume\(s\) added/);await page.click('#run');
  assert.equal(await page.locator('.identity h3').textContent(),'Candidate 01');assert.equal(await page.locator('.coverage strong').textContent(),'2/2');
});
test('unsupported and oversized uploads report errors without candidates',async()=>{
  await page.setInputFiles('#files',{name:'resume.exe',mimeType:'application/octet-stream',buffer:Buffer.from('invalid file')});await notice(/Use a PDF, DOCX or TXT/);
  await page.setInputFiles('#files',{name:'large.txt',mimeType:'text/plain',buffer:Buffer.alloc(5*1024*1024+1,65)});await notice(/File exceeds 5 MB/);await count('#candidate-list li',0);
});
test('PDF reader download failure recovers to a usable interface',async()=>{
  await page.setInputFiles('#files',{name:'resume.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 test fixture')});
  await notice(/0 resume\(s\) added/);assert.equal(await page.locator('#files').isEnabled(),true);
  await addResume();await count('#candidate-list li',1);
});
test('DOCX reader download failure is actionable and retryable',async()=>{
  const file={name:'resume.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from('test fixture')};
  await page.setInputFiles('#files',file);await notice(/DOCX reader could not download/);
  await page.setInputFiles('#files',file);await notice(/DOCX reader could not download/);await count('#candidate-list li',0);
});
test('candidate limit is enforced without replacing existing resumes',async()=>{
  for(let i=0;i<10;i++)await addResume('Built React interfaces and TypeScript applications for a team.',`Candidate ${i}`);
  await addResume();await notice(/up to 10 resumes/);await count('#candidate-list li',10);
});
test('removing candidate invalidates results and updates counts',async()=>{
  await sample();await page.locator('#candidate-list button').first().click();await count('#candidate-list li',2);await count('.review-card',0);
  assert.equal(await page.textContent('#stat-resumes'),'2');
});
test('sample action does not overwrite user work',async()=>{
  await addResume();await page.click('#demo');await notice(/Clear the workspace before loading/);await count('#candidate-list li',1);
});
test('JSON export contains current review flags, evidence and confidentiality warning',async()=>{
  await sample();await page.locator('.review-note input').first().check();
  const promise=page.waitForEvent('download');await page.click('#export');const download=await promise;
  assert.equal(download.suggestedFilename(),'matchline-review.json');
  const data=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.equal(data.reports.length,3);assert.equal(data.reports[0].reviewed,true);assert.match(data.reports[0].rows[0].evidence,/React/);
  assert.match(data.disclaimer,/confidential/);assert.equal(data.reports[0].text,undefined);
});
test('clear workspace requires confirmation and removes all review data',async()=>{
  await sample();await page.click('#reset');await page.click('#cancel-clear');await count('.review-card',3);
  await page.click('#reset');await page.click('#confirm-clear');await count('#candidate-list li',0);await count('.review-card',0);
  assert.equal(await page.inputValue('#requirements'),'');assert.equal(await page.locator('#export').isDisabled(),true);
});
test('candidate-supplied HTML is rendered as text, not executable markup',async()=>{
  await page.fill('#requirements','React');await addResume('React developer. <img src=x onerror="window.injected=true"> Built interfaces.', '<svg onload="window.injected=true">');
  await page.click('#run');await page.locator('.card-details summary').click();assert.equal(await page.evaluate(()=>window.injected),undefined);
  await count('.review-card img,.review-card svg',0);assert.match(await page.locator('.identity h3').textContent(),/<svg/);
});
test('quick review stores no resume data and makes no external requests',async()=>{
  const external=[];page.on('request',r=>{if(!r.url().startsWith(origin))external.push(r.url());});await sample();
  assert.deepEqual(external,[]);
  assert.deepEqual(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length})),{local:0,session:0});
  await page.reload();await count('.review-card',0);assert.equal(await page.textContent('#stat-resumes'),'0');
});
test('AI consent cancellation does not start downloads',async()=>{
  const external=[];page.on('request',r=>{if(!r.url().startsWith(origin))external.push(r.url());});
  await page.click('#enable-ai');assert.equal(await page.locator('#ai-consent').isVisible(),true);await page.click('#cancel-ai');assert.deepEqual(external,[]);
});
test('AI success contract renders suggestions without increasing mention coverage [mocked worker]',async()=>{
  await mockAI();await enableAI();await page.fill('#requirements','Accessibility');await addResume('Improved keyboard navigation and labels for screen readers.');await page.click('#run');
  await page.locator('.review-card').waitFor();assert.equal(await page.locator('.coverage strong').textContent(),'0/1');
  await page.locator('.card-details summary').click();assert.match(await page.locator('.card-details').innerText(),/AI suggestion · verify/);
  assert.match(await page.locator('.card-details').innerText(),/0.62/);
});
test('AI download failure leaves quick review functional [mocked worker]',async()=>{
  await mockAI('error');await page.click('#enable-ai');await page.click('#confirm-ai');await notice(/AI unavailable/);
  await sample();assert.equal(await page.locator('.coverage strong').first().textContent(),'6/6');assert.match(await page.textContent('#workspace-label'),/rules-based/);
});
test('AI disable clears stale AI-assisted results [mocked worker]',async()=>{
  await mockAI();await enableAI();await sample();await page.click('#enable-ai');await count('.review-card',0);
  assert.equal(await page.locator('#export').isDisabled(),true);await notice(/AI stopped/);
});
test('stale AI results are discarded when skills change [mocked worker]',async()=>{
  await mockAI('slow');await enableAI();await page.fill('#requirements','React');await addResume();await page.click('#run');
  await page.fill('#requirements','SQL');await page.waitForFunction(()=>!document.querySelector('#run').disabled);
  await count('.review-card',0);assert.equal(await page.locator('#export').isDisabled(),true);
});
test('mobile viewport has no horizontal overflow and supports evidence expansion',async()=>{
  await page.setViewportSize({width:390,height:844});await sample();await page.locator('.card-details summary').first().click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.click('#about');assert.equal(await page.locator('#info').isVisible(),true);await page.click('#close-info');
  const html=(await page.content()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  await writeFile(path.join(root,'test-results','sample-mobile.html'),html);
});
test('keyboard navigation reaches skip link and modal closes with Escape',async()=>{
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Skip to workspace');
  await page.click('#about');await page.keyboard.press('Escape');assert.equal(await page.locator('#info').isVisible(),false);
});

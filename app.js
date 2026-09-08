import {parseSkills,suggestSkills,exactReview,sample} from './core.js';
const $=id=>document.getElementById(id);
let candidates=[], reports=[], version=0, busy=false, importBusy=false, sampleMode=false;
let worker=null, aiReady=false, aiLoading=false, sequence=0;
const pending=new Map();
function message(text){$('message').textContent=text;}
function node(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
const inputs=['role','jd','requirements'];
function invalidate(){version++;reports=[];$('export').disabled=true;$('stat-reviewed').textContent='0';$('results').replaceChildren(node('div','Setup changed. Select “Review resumes” to refresh the evidence.','empty'));updateStats();}
function updateStats(){
  $('count').textContent=`${candidates.length} / 10`;
  $('stat-resumes').textContent=String(candidates.length);
  try{$('stat-skills').textContent=String(parseSkills($('requirements').value).length);}catch{$('stat-skills').textContent='0';}
  $('stat-reviewed').textContent=String(reports.filter(r=>r.reviewed).length);
}
inputs.forEach(id=>$(id).addEventListener('input',()=>{sampleMode=false;invalidate();}));
function refreshList(){
  const list=$('candidate-list');list.replaceChildren();
  candidates.forEach(c=>{const li=node('li'),label=node('span',c.label),button=node('button','Remove');button.type='button';button.setAttribute('aria-label',`Remove ${c.label}`);button.onclick=()=>{candidates=candidates.filter(x=>x.id!==c.id);refreshList();invalidate();};li.append(label,button);list.append(li);});
  updateStats();
}
function validateText(text){if(text.trim().length<30)throw new Error('Resume needs at least 30 characters of readable text. For scanned PDFs, paste text from an OCR tool.');if(text.length>40000)throw new Error('Resume exceeds 40,000 characters. Paste a shorter version.');}
function addCandidate(label,text){validateText(text);if(candidates.length>=10)throw new Error('This review supports up to 10 resumes.');candidates.push({id:crypto.randomUUID(),label:label.trim().slice(0,80)||`Candidate ${String(candidates.length+1).padStart(2,'0')}`,text:text.trim()});refreshList();invalidate();}
$('add').onclick=()=>{try{addCandidate($('candidate').value,$('resume').value);$('candidate').value='';$('resume').value='';message('Resume added. Ready when you are.');}catch(e){message(e.message);}};
$('extract').onclick=()=>{const found=suggestSkills($('jd').value);if(!found.length){message('No known skills found. Enter job-related skills manually.');return;}$('requirements').value=found.join(', ');invalidate();message('Suggested skills added using a keyword dictionary, not AI. Edit them before reviewing.');};
let mammothPromise;
async function readResume(file){
  if(file.size>5*1024*1024)throw new Error('File exceeds 5 MB.');
  if(/\.txt$/i.test(file.name)) return file.text();
  if(/\.pdf$/i.test(file.name)){
    const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});
    try{
      const doc=await task.promise;if(doc.numPages>30)throw new Error('Use a PDF with at most 30 pages.');
      let text='';for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i);const content=await page.getTextContent();text+=content.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('')+'\n';if(text.length>40000)throw new Error('Resume exceeds 40,000 characters.');}return text;
    }finally{await task.destroy();}
  }
  if(/\.docx$/i.test(file.name)){
    if(!mammothPromise)mammothPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/mammoth@1.9.0/mammoth.browser.min.js';script.onload=()=>resolve(window.mammoth);script.onerror=()=>{script.remove();mammothPromise=null;reject(new Error('DOCX reader could not download. Paste resume text instead.'));};document.head.append(script);});
    const mammoth=await mammothPromise;const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});return result.value;
  }
  throw new Error('Use a PDF, DOCX or TXT file.');
}
async function importFiles(files){
  if(importBusy){message('Please wait for the current file import.');return;}
  if(files.length>10-candidates.length){message(`There is room for ${10-candidates.length} more resumes. Select fewer files.`);return;}
  importBusy=true;$('files').disabled=true;$('reset').disabled=true;$('demo').disabled=true;$('run').disabled=true;
  const errors=[];let added=0;
  try{for(const file of files){message(`Reading ${file.name} locally…`);try{const text=await readResume(file);addCandidate('',text);added++;}catch(e){errors.push(`${file.name}: ${e.message}`);}}}
  finally{importBusy=false;$('files').disabled=false;$('reset').disabled=false;$('demo').disabled=false;$('run').disabled=busy;$('files').value='';message(`${added} resume(s) added with anonymous labels.${errors.length?' '+errors.join(' | '):' Review extracted evidence before use.'}`);}
}
$('files').onchange=e=>importFiles([...e.target.files]);
['dragenter','dragover'].forEach(t=>$('drop').addEventListener(t,e=>{e.preventDefault();$('drop').classList.add('dragging');}));
['dragleave','drop'].forEach(t=>$('drop').addEventListener(t,e=>{e.preventDefault();$('drop').classList.remove('dragging');}));
$('drop').addEventListener('drop',e=>importFiles([...e.dataTransfer.files]));
function request(type,data={},timeout=180000){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('AI timed out. Disable AI and use quick review, or try again on a desktop browser.'));},timeout);pending.set(id,{resolve,reject,timer});worker.postMessage({id,type,...data});});}
function stopAI(){if(worker)worker.terminate();worker=null;aiReady=false;aiLoading=false;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('AI stopped.'));}pending.clear();$('enable-ai').textContent='Enable AI ↗';$('ai-status').textContent='Optional on-device AI finds related evidence. No API key.';}
$('enable-ai').onclick=()=>{if(aiReady||aiLoading){stopAI();invalidate();message('AI stopped. Quick review is available.');}else $('ai-consent').showModal();};
$('cancel-ai').onclick=()=>$('ai-consent').close();
$('confirm-ai').onclick=async()=>{
  $('ai-consent').close();aiLoading=true;$('enable-ai').textContent='Cancel download';$('ai-status').textContent='Loading local AI… first download may take a few minutes.';
  try{
    worker=new Worker(new URL('./ai-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;if(data.progress){$('ai-status').textContent=data.progress;return;}clearTimeout(p.timer);pending.delete(data.id);data.error?p.reject(new Error(data.error)):p.resolve(data.result);};
    worker.onerror=()=>{stopAI();message('Local AI could not start. Quick review remains available. Check your network and browser.');};
    await request('load',{},300000);aiReady=true;aiLoading=false;$('enable-ai').textContent='Disable AI';$('ai-status').textContent='Local AI ready · semantic evidence stays on your device.';invalidate();message('AI enabled. Run a review to find related evidence.');
  }catch(e){stopAI();message(`AI unavailable: ${e.message} Quick review remains available.`);}
};
async function review(){
  if(busy||importBusy)return;
  let skills;try{skills=parseSkills($('requirements').value);if(!candidates.length)throw new Error('Add at least one resume, or try the sample review.');}catch(e){message(e.message);return;}
  busy=true;$('run').disabled=true;$('run').textContent='Reviewing…';$('export').disabled=true;
  const token=version, snapshot=candidates.map(x=>({...x})), useAI=aiReady;
  let next=[];
  try{
    for(let i=0;i<snapshot.length;i++){
      const c=snapshot[i];message(`Reviewing ${i+1} of ${snapshot.length}${useAI?' with local AI':''}…`);
      const rows=exactReview(c.text,skills);
      if(useAI){const related=await request('analyze',{text:c.text,skills});if(token!==version)return;rows.forEach((r,j)=>{if(!r.evidence&&related[j].similarity>=0.3){r.related=related[j].related;r.similarity=related[j].similarity;}});}
      next.push({id:c.id,label:c.label,rows,reviewed:false,mode:useAI?'Local AI + explicit mentions':'Explicit mentions (rules-based)',role:$('role').value.trim()||'Untitled role',requirements:skills});
    }
    if(token!==version)return;
    reports=next;render();$('export').disabled=false;$('workspace-label').textContent=`${sampleMode?'Fictional sample · ':''}${$('role').value.trim()||'Untitled role'} · ${useAI?'AI-assisted review':'Quick review · rules-based'}`;
    message('Review ready. Verify source evidence and context. Candidates remain in input order, not ranked.');
  }catch(e){reports=[];render();message(`Review failed: ${e.message} Disable AI to use quick review.`);}
  finally{busy=false;$('run').disabled=importBusy;$('run').textContent='Review resumes →';}
}
$('run').onclick=review;
function render(){
  $('results').replaceChildren();
  for(const report of reports){
    const card=node('article',undefined,'review-card'),head=node('div',undefined,'card-head'),identity=node('div',undefined,'identity'),name=node('div');
    name.append(node('h3',report.label),node('p',report.mode));identity.append(node('div','CV','avatar'),name);
    const matched=report.rows.filter(r=>r.evidence).length,coverage=node('div',undefined,'coverage');coverage.append(node('strong',`${matched}/${report.rows.length}`),node('span','skills mentioned'));head.append(identity,coverage);card.append(head);
    const track=node('div',undefined,'track'),fill=node('div');fill.style.width=`${matched/report.rows.length*100}%`;track.append(fill);card.append(track);
    const chips=node('div',undefined,'chips');report.rows.forEach(r=>chips.append(node('span',`${r.evidence?'✓':r.related?'≈':'–'} ${r.skill}`,`chip${r.evidence?' found':''}`)));card.append(chips);
    const detail=node('details',undefined,'card-details');detail.append(node('summary','Inspect evidence & gaps'));
    for(const r of report.rows){const e=node('div',undefined,'evidence'),row=node('div',undefined,'between');row.append(node('strong',r.skill),node('span',r.evidence?'Explicit mention':r.related?'AI suggestion · verify':'Not found',`status${r.evidence?'':' missing'}`));e.append(row,node('p',r.evidence?`“${r.evidence}”`:r.related?`“${r.related}”`:'No explicit mention found. Ask for a relevant example; do not assume lack of skill.'));if(r.related)e.append(node('p',`Semantic similarity ${r.similarity.toFixed(2)} · uncalibrated, not a probability or qualification score. AI suggestions do not increase mention coverage.`));detail.append(e);}card.append(detail);
    const review=node('div',undefined,'review-note'),check=node('input');check.type='checkbox';check.id=`review-${report.id}`;check.checked=report.reviewed;check.onchange=()=>{report.reviewed=check.checked;updateStats();};const label=node('label','I have checked the evidence and context');label.htmlFor=check.id;review.append(check,label);card.append(review);$('results').append(card);
  }
  if(!reports.length)$('results').append(node('div','No results yet. Check the setup and run a review.','empty'));
  updateStats();
}
async function loadDemo(){if(importBusy||busy)return;if(candidates.length){message('Clear the workspace before loading the sample, so your current resumes are not replaced.');return;}sampleMode=true;$('role').value=sample.role;$('jd').value=sample.jd;$('requirements').value=sample.skills;candidates=sample.candidates.map(c=>({...c,id:crypto.randomUUID()}));refreshList();invalidate();await review();}
$('demo').onclick=loadDemo;$('empty-demo').onclick=loadDemo;
$('about').onclick=()=>$('info').showModal();$('close-info').onclick=()=>$('info').close();
$('reset').onclick=()=>$('clear-consent').showModal();$('cancel-clear').onclick=()=>$('clear-consent').close();
$('confirm-clear').onclick=()=>{$('clear-consent').close();if(worker&&!aiReady)stopAI();if(busy&&worker)stopAI();candidates=[];reports=[];sampleMode=false;inputs.forEach(id=>$(id).value='');$('resume').value='';$('candidate').value='';$('files').value='';$('workspace-label').textContent='A fresh perspective on every application.';refreshList();invalidate();message('Workspace cleared. No resumes are saved by this app.');};
$('export').onclick=()=>{
  if(!reports.length)return;
  const data={app:'Matchline',version:'1.0.0',exportedAt:new Date().toISOString(),disclaimer:'Human decision support only. Explicit mentions are not verified qualifications. AI similarities are uncalibrated. Missing evidence does not mean missing skill. Contains resume excerpts; handle as confidential.',reports};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download='matchline-review.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);message('Report exported. It contains resume excerpts; store and share it securely.');
};
window.addEventListener('beforeunload',()=>{if(worker)worker.terminate();});

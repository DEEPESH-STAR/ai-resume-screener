import { chunks, cosine } from './core.js';
let extractor;
self.onmessage = async ({data}) => {
  const {id,type,text,skills} = data;
  try {
    if(type==='load') {
      const {pipeline,env} = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2/dist/transformers.min.js');
      env.allowLocalModels=false;
      env.backends.onnx.wasm.numThreads=1;
      extractor = await pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2',{
        dtype:'q8', device:'wasm', progress_callback:p=>{
          if(p.status==='progress') self.postMessage({id,progress:`Downloading AI files… ${Math.round(p.progress || 0)}% (${p.file || 'model'})`});
        }
      });
      self.postMessage({id,result:true});
    } else if(type==='analyze') {
      if(!extractor) throw new Error('AI is not loaded.');
      const parts=chunks(text);
      const skillVectors=(await extractor(skills,{pooling:'mean',normalize:true})).tolist();
      const best=skills.map(()=>({related:'',similarity:-1}));
      for(let i=0;i<parts.length;i+=12){
        const batch=parts.slice(i,i+12);
        const vectors=(await extractor(batch,{pooling:'mean',normalize:true})).tolist();
        for(let j=0;j<skills.length;j++) for(let k=0;k<vectors.length;k++){
          const score=cosine(skillVectors[j],vectors[k]);
          if(score>best[j].similarity) best[j]={related:batch[k],similarity:score};
        }
      }
      self.postMessage({id,result:best});
    }
  }catch(error){ self.postMessage({id,error:error.message || 'Local AI failed.'}); }
};

import test from 'node:test';
import assert from 'node:assert/strict';
import {contains,parseSkills,suggestSkills,exactReview,cosine,chunks,sample} from '../core.js';

test('skill matching is case-insensitive and uses token boundaries',()=>{
  assert.equal(contains('Built REACT applications','React'),true);
  assert.equal(contains('JavaScript developer','Java'),false);
  assert.equal(contains('GitHub workflows','Git'),false);
});
test('punctuation-bearing skills are treated literally',()=>{
  for(const skill of ['C++','C#','.NET','Node.js']) assert.equal(contains(`Skills: ${skill}, SQL`,skill),true);
  assert.equal(contains('C++ developer','C'),false);
  assert.equal(contains('aXb','a.b'),false);
});
test('skills support comma, semicolon and newline separators and deduplication',()=>{
  assert.deepEqual(parseSkills(' React, react; TypeScript\nSQL '),['React','TypeScript','SQL']);
});
test('missing, too many, and oversized skills are rejected',()=>{
  assert.throws(()=>parseSkills(' , ; '),/at least one/);
  assert.throws(()=>parseSkills(Array.from({length:13},(_,i)=>`Skill ${i}`).join(',')),/up to 12/);
  assert.throws(()=>parseSkills('x'.repeat(61)),/60 characters/);
});
test('common protected-trait criteria are rejected',()=>{
  for(const value of ['age','gender','religion','caste','marital status','nationality','disability','sexual orientation']) assert.throws(()=>parseSkills(value),/protected/);
});
test('dictionary extraction resolves aliases without Java/JavaScript confusion',()=>{
  const skills=suggestSkills('React.js, JavaScript, WCAG and pytest.');
  for(const s of ['React','JavaScript','Accessibility','Testing'])assert.ok(skills.includes(s));
  assert.ok(!skills.includes('Java'));
});
test('exact review retains source text and identifies gaps',()=>{
  const result=exactReview('Built a React dashboard.\nUsed WCAG guidance.', ['React','Accessibility','SQL']);
  assert.equal(result[0].evidence,'Built a React dashboard.');
  assert.equal(result[1].evidence,'Used WCAG guidance.');
  assert.equal(result[2].evidence,'');
  assert.equal(result[2].related,'');
});
test('quick review does not pretend to understand negation',()=>{
  assert.equal(exactReview('I have no React experience.', ['React'])[0].evidence,'I have no React experience.');
});
test('long passages are chunked without losing end-of-resume skill evidence',()=>{
  const text='ordinary '.repeat(300)+'Docker experience';
  assert.ok(chunks(text).length>1);
  assert.match(exactReview(text,['Docker'])[0].evidence,/Docker/);
});
test('cosine similarity handles equal, orthogonal and zero vectors',()=>{
  assert.equal(cosine([1,0],[1,0]),1);
  assert.equal(cosine([1,0],[0,1]),0);
  assert.equal(cosine([0,0],[0,0]),0);
  assert.throws(()=>cosine([1],[1,2]),/dimensions/);
});
test('sample mention counts remain 6, 3 and 2 in input order',()=>{
  const skills=parseSkills(sample.skills);
  assert.deepEqual(sample.candidates.map(c=>exactReview(c.text,skills).filter(x=>x.evidence).length),[6,3,2]);
});

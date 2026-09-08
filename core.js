export const ALIASES = {
  'React': ['react', 'react.js', 'reactjs'], 'TypeScript': ['typescript'],
  'JavaScript': ['javascript', 'js'], 'Python': ['python'], 'Java': ['java'],
  'C++': ['c++'], 'C#': ['c#'], '.NET': ['.net', 'dotnet'],
  'Node.js': ['node.js', 'nodejs', 'node js'], 'SQL': ['sql', 'postgresql', 'mysql'],
  'HTML': ['html', 'html5'], 'CSS': ['css', 'css3'], 'Git': ['git'],
  'Testing': ['testing', 'jest', 'vitest', 'pytest', 'playwright', 'unit tests'],
  'Accessibility': ['accessibility', 'wcag', 'a11y'], 'AWS': ['aws', 'amazon web services'],
  'Docker': ['docker'], 'Kubernetes': ['kubernetes', 'k8s'], 'Figma': ['figma'],
  'Excel': ['excel'], 'Tableau': ['tableau'], 'Power BI': ['power bi'],
  'Communication': ['communication', 'presentations', 'stakeholder updates'],
  'Project management': ['project management'], 'Machine learning': ['machine learning'],
  'Data analysis': ['data analysis', 'data analytics'], 'REST APIs': ['rest api', 'restful', 'rest apis']
};
const escapeRegex = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function contains(text, term) {
  return new RegExp('(^|[^\\p{L}\\p{N}_])' + escapeRegex(term.trim()) + '(?=$|[^\\p{L}\\p{N}_+#])', 'iu').test(text);
}
export function aliasesFor(skill) {
  const entry = Object.entries(ALIASES).find(([k,v]) => k.toLowerCase() === skill.toLowerCase() || v.includes(skill.toLowerCase()));
  return entry ? entry[1] : [skill];
}
export function parseSkills(text) {
  const unique = new Map();
  for (const value of text.split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean)) {
    if (!unique.has(value.toLowerCase())) unique.set(value.toLowerCase(), value);
  }
  const skills = [...unique.values()];
  if (!skills.length) throw new Error('Add at least one job-related skill to review.');
  if (skills.length > 12) throw new Error('Use up to 12 skills per review.');
  if (skills.some(x => x.length > 60)) throw new Error('Keep each skill under 60 characters.');
  const protectedTerms = /\b(age|gender|sex|race|racial|religion|religious|caste|pregnan\w*|marital|ethnic\w*|nationality|disabilit\w*|sexual orientation|birth|male|female|citizenship)\b/i;
  if (skills.some(x=>protectedTerms.test(x))) throw new Error('Use job-related skills, not personal or protected characteristics.');
  return skills;
}
export function suggestSkills(text) {
  return Object.entries(ALIASES).filter(([,v]) => v.some(a=>contains(text,a))).map(([k])=>k).slice(0,12);
}
export function chunks(text) {
  return text.split(/\n+|(?<=[.!?])\s+(?=[A-Z])/).flatMap(line => {
    const words=line.trim().split(/\s+/), out=[];
    for(let i=0;i<words.length;i+=55) { const part=words.slice(i,i+65).join(' '); if(part.length>3) out.push(part); }
    return out;
  });
}
export function exactReview(text, skills) {
  const parts=chunks(text);
  return skills.map(skill => ({skill, evidence: parts.find(p=>aliasesFor(skill).some(a=>contains(p,a))) || '', related:'', similarity:null}));
}
export function cosine(a,b) {
  if(a.length !== b.length || !a.length) throw new Error('Invalid embedding dimensions.');
  let dot=0, aa=0, bb=0;
  for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
  return aa&&bb ? dot/Math.sqrt(aa*bb) : 0;
}
export const sample = {
  role: 'Frontend Engineer',
  jd: 'Build accessible web experiences using React and TypeScript. Work with REST APIs, write tests, and collaborate with design using Figma. Use Git for code review.',
  skills: 'React, TypeScript, REST APIs, Testing, Accessibility, Git',
  candidates: [
    {label:'Candidate 01 · Sample',text:'Frontend developer — fictional sample\nBuilt a React and TypeScript dashboard for an inventory team.\nIntegrated REST APIs for live product data.\nWrote unit tests using Vitest and browser tests with Playwright.\nWorked on WCAG accessibility fixes, keyboard navigation and screen-reader labels.\nUsed Git branches and pull requests to review changes.'},
    {label:'Candidate 02 · Sample',text:'Web developer — fictional sample\nBuilt responsive React interfaces using JavaScript and CSS.\nIntegrated REST APIs for reporting tools.\nCoordinated changes through Git pull requests.\nPartnered with designers on Figma prototypes.\nImproved keyboard navigation and added labels for screen readers.'},
    {label:'Candidate 03 · Sample',text:'Software developer — fictional sample\nBuilt Python services and SQL data pipelines.\nWrote automated testing suites with pytest.\nManaged Git pull requests and Docker deployments.\nDocumented service endpoints and collaborated with a frontend team.'}
  ]
};

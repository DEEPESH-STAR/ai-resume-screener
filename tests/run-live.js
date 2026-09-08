// Cross-platform opt-in launcher: never reports skipped live tests as passing.
import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
mkdirSync(new URL('../test-results',import.meta.url),{recursive:true});
const child=spawnSync(process.execPath,['--test','--test-reporter=spec','--test-reporter-destination=stdout','--test-reporter=junit','--test-reporter-destination=test-results/live-results.xml','tests/live.test.js'],{cwd:root,env:{...process.env,RUN_LIVE:'1'},stdio:'inherit'});
if(child.error){console.error(child.error.message);process.exit(1);}
process.exit(child.status??1);

import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
const qa=await createQa('audio-alignment',{timeoutMs:210000}),require=createRequire(import.meta.url);
const esbuild=require(require.resolve('esbuild',{paths:[path.dirname(require.resolve('vite/package.json'))]}));
const bundle=path.join(qa.output,'fixtures.cjs');
await esbuild.build({stdin:{contents:`export {parseProject,serializeProject,countToSeconds,secondsToCount} from './src/domain'; export {compileTempo} from './src/tempo';import {createDemoProject} from './src/domain';export function fixture(){const p=createDemoProject();p.title='Variable recording alignment';p.sets=p.sets.slice(0,3);p.moves=p.moves.slice(0,2).map(m=>({...m,counts:8,tempo:120,transition:'linear',paths:{}}));p.audioOffsetSeconds=.4;return p;}`,resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:bundle,logLevel:'silent'});
const bytes=Buffer.alloc(44+8000*16*2);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(bytes.length-44,40);
const files=await fs.mkdtemp(path.join(qa.output,'files-'));
for(let count=0;count<=16;count++){const seconds=.4+(count<=4?count*.625:count<=8?2.5+(count-4)*.5:4.5+(count-8)*.75);for(let n=0;n<240;n++){const index=Math.round(seconds*8000)+n;if(44+index*2+2<=bytes.length)bytes.writeInt16LE(Math.round(18000*Math.exp(-n/55)*Math.sin(2*Math.PI*880*n/8000)),44+index*2);}}
const recording=path.join(files,'variable-tempo-recording.wav');await fs.writeFile(recording,bytes);
await qa.run('audio-alignment-qa-runner.cjs','audio-alignment-manifest',{bundle,recording,files});

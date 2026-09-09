import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildEditPlan, preflightEditPlan, ffmpegArgsForEpisode, qcEpisode, evaluateEpisodeProbe } from './post-kit.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'post-workflow-test-'));
try {
  const media=path.join(root,'candidate.mp4');fs.writeFileSync(media,'hash fixture');
  const base={jobId:'take-a',episode:1,clipId:'E01-01',duration:5,sequence:1,status:'succeeded',outputPath:'candidate.mp4'};
  const manifest={project:{id:'test',format:{aspectRatio:'16:9',fps:24}},jobs:[base,{...base,jobId:'take-b'},{...base,episode:2,jobId:'take-c'}]};
  const source=JSON.stringify(manifest), file=path.join(root,'production.json');
  assert.throws(()=>buildEditPlan(manifest,file),/多个成功版本/);
  const plan=buildEditPlan(manifest,file,{takeSelections:{'1/E01-01':'take-b'}});
  assert.deepEqual(plan.episodes.map(ep=>ep.clips.map(c=>c.jobId)),[['take-b'],['take-c']]);
  assert.equal(JSON.stringify(manifest),source);
  for(const takeSelections of [{'1/E01-01':'unknown'},{'1/E01-01':''},{'3/E01-01':'take-b'},[]]) assert.throws(()=>buildEditPlan(manifest,file,{takeSelections}));
  assert.equal(preflightEditPlan(plan,{ffprobe:null,ffmpeg:null}).ok,true);
  const args=ffmpegArgsForEpisode(plan,plan.episodes[0]);assert.ok(args.includes('-n'));assert.ok(!args.includes('-y'));
  plan.episodes[0].clips[0].trimIn=1;
  assert.equal(preflightEditPlan(plan,{ffprobe:null,ffmpeg:null}).ok,false);
  plan.episodes[0].clips[0].trimIn=0;
  fs.writeFileSync(media,'replaced after review');
  assert.equal(preflightEditPlan(plan,{ffprobe:null,ffmpeg:null}).ok,false);
  const qc=qcEpisode(plan,{...plan.episodes[0],output:media},{ffprobe:null});
  assert.equal(qc.ok,false);assert.equal(qc.verified,false);
  const probe={available:true,format:{duration:'5'},streams:[{codec_type:'video',width:1920,height:1080,avg_frame_rate:'24/1'},{codec_type:'audio',sample_rate:'48000',channels:2}]};
  assert.equal(evaluateEpisodeProbe(plan,plan.episodes[0],probe).ok,true);
  for (const duration of [undefined,'N/A','0','-1','10']) assert.equal(evaluateEpisodeProbe(plan,plan.episodes[0],{...probe,format:{duration}}).ok,false);
  for (const avg_frame_rate of ['0/0','30/1',undefined]) {
    const changed=structuredClone(probe);changed.streams[0].avg_frame_rate=avg_frame_rate;
    assert.equal(evaluateEpisodeProbe(plan,plan.episodes[0],changed).ok,false);
  }
  const mono=structuredClone(probe);mono.streams[1].channels=1;
  assert.equal(evaluateEpisodeProbe(plan,plan.episodes[0],mono).ok,false);
  console.log('PASS post workflow: explicit takes, episode isolation, invalid selections, no silent overwrite/trim, source hashes, incomplete QC');
} finally {
  const resolved=path.resolve(root),tmp=path.resolve(os.tmpdir());
  if(resolved.startsWith(tmp+path.sep)&&path.basename(resolved).startsWith('post-workflow-test-'))fs.rmSync(resolved,{recursive:true,force:true});
}

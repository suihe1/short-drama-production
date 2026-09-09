#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const companions=['novel-outline','novel-characters','novel-art','novel-script','short-drama-director','novel-storyboard','h3-prompt-writing'];
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainEntries=['SKILL.md','LICENSE','README.md','agents','assets','references','scripts'];
export function planInstall(destination) {
  const dest=path.resolve(destination);
  if(dest===root||dest.startsWith(root+path.sep))throw Error('安装目录不能位于发布仓库内部');
  return ['short-drama-production',...companions].map(name=>{
    const source=name==='short-drama-production'?root:path.join(root,'skills',name);
    if(!fs.existsSync(path.join(source,'SKILL.md')))throw Error(`发布包缺少 ${name}`);
    const target=path.join(dest,name);
    if(fs.existsSync(target))throw Error(`目标已存在，未覆盖任何 skill：${target}；请使用新的安装目录或先备份并迁移旧版本`);
    const entries=name==='short-drama-production'?mainEntries:fs.readdirSync(source);
    const files=[];
    function collect(rel){const absolute=path.join(source,rel),stat=fs.lstatSync(absolute);if(stat.isSymbolicLink())throw Error(`不支持符号链接：${absolute}`);if(stat.isDirectory()){for(const entry of fs.readdirSync(absolute))collect(path.join(rel,entry));}else if(stat.isFile())files.push(rel);}
    for(const entry of entries)if(fs.existsSync(path.join(source,entry)))collect(entry);
    return {name,source,target,files};
  });
}
export function installBundle(destination) {
  const plan=planInstall(destination);
  for(const pkg of plan)for(const rel of pkg.files){const target=path.join(pkg.target,rel);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(pkg.source,rel),target,fs.constants.COPYFILE_EXCL);}
  return plan;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2),index=args.indexOf('--dest');
    if(args.includes('--help'))console.log('node scripts/install-bundle.mjs --dest <skills-directory> [--apply]');
    else{
      if(index<0||!args[index+1]||args[index+1].startsWith('--'))throw Error('必须指定 --dest <skills-directory>');
      const plan=args.includes('--apply')?installBundle(args[index+1]):planInstall(args[index+1]);
      console.log(JSON.stringify({applied:args.includes('--apply'),packages:plan.map(({name,target,files})=>({name,target,files:files.length})),note:'默认仅预览；--apply 写入新目录，不覆盖已有 skill。'},null,2));
    }
  }catch(error){console.error(error.message);process.exitCode=1;}
}

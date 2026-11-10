import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../server/storage'
import { memoryContext, textDiff } from '../server/memory'
import { record } from './fixtures'
import 'fake-indexeddb/auto'
import { pendingRecords, saveRecord } from '../src/services/pendingSaves'

test('SQLite survives reopen, keeps complete report, idempotency and owner isolation',()=>{
 const filename=join(mkdtempSync(join(tmpdir(),'resume-test-')),'db.sqlite')
 let s=new Store(filename);const a=record();s.save(a);s.save(a);assert.equal(s.list().length,1)
 assert.equal(s.get('a','other'),undefined);assert.deepEqual(s.list('other'),[]);assert.throws(()=>s.save(a,'other'))
 s.delete('a','other');assert.ok(s.get('a'));s.close();s=new Store(filename);assert.deepEqual(s.get('a'),a);s.close()
})
test('related history, confirmed facts, issue status, deletion and tombstone',()=>{
 const s=new Store(join(mkdtempSync(join(tmpdir(),'resume-test-')),'db.sqlite'))
 s.save(record());s.memory({id:'m',category:'技能',text:'Python 用户已确认',confirmedAt:new Date().toISOString()})
 assert.match(memoryContext(s,record().input),/缺少项目指标/);assert.match(memoryContext(s,record().input),/Python/)
 assert.doesNotMatch(memoryContext(s,{...record().input,targetRole:'设计师',targetIndustry:'制造业'}),/缺少项目指标/)
 const issue=s.issues('a')[0];s.issue(issue.id,'user-reported-fixed');assert.equal(s.issues('a')[0].status,'user-reported-fixed')
 const b={...record('b'),baselineId:'a',comparison:{added:[],removed:[],modified:[],resolved:[],remaining:[],newProblems:[],nextActions:[],evidence:[]}}
 s.save(b);s.delete('a');assert.equal(s.get('a'),undefined);assert.equal(s.get('b')?.comparison,undefined);assert.equal(s.issues('a').length,0);assert.throws(()=>s.save(record()))
 assert.doesNotMatch(memoryContext(s,{...record().input,targetRole:'设计师',targetIndustry:'制造业'}),/缺少项目指标/)
 s.deleteMemory('m');assert.equal(s.memories().length,0);s.close()
})
test('failed save stages full report and retry reuses ID without another analysis',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('disk offline')}
 try{
  await assert.rejects(saveRecord(record('pending')),/暂存/)
  assert.deepEqual((await pendingRecords())[0],record('pending'))
  const stored=new Map();globalThis.fetch=async(_url,opts)=>{const r=JSON.parse(opts!.body as string);stored.set(r.id,r);return new Response(JSON.stringify({success:true,data:r}))}
  await saveRecord(record('pending'));await saveRecord(record('pending'));assert.equal(stored.size,1);assert.equal((await pendingRecords()).length,0)
 }finally{globalThis.fetch=old}
})
test('text difference identifies additions and removals',()=>{assert.deepEqual(textDiff('SQL\n旧项目','SQL\n新增指标'),{added:['新增指标'],removed:['旧项目']})})

test('another Node process reads saved data after service process exits',async()=>{
 const {spawnSync}=await import('node:child_process')
 const filename=join(mkdtempSync(join(tmpdir(),'resume-restart-')),'db.sqlite')
 const first=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`import {Store} from './server/storage.ts'; import {record} from './tests/fixtures.ts'; const s=new Store(process.env.RESTART_DB);s.save(record('restart'));s.close()`],{cwd:process.cwd(),env:{...process.env,RESTART_DB:filename},encoding:'utf8'})
 assert.equal(first.status,0,first.stderr)
 const second=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`import {Store} from './server/storage.ts';const s=new Store(process.env.RESTART_DB);console.log(s.get('restart').initial.resumeDiagnosis.matchScore);s.close()`],{cwd:process.cwd(),env:{...process.env,RESTART_DB:filename},encoding:'utf8'})
 assert.equal(second.status,0,second.stderr);assert.equal(second.stdout.trim(),'60')
})

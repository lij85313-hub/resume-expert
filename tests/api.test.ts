import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { record, initial, input, optimized } from './fixtures'
process.env.NODE_ENV='test';process.env.RESUME_DB_PATH=join(mkdtempSync(join(tmpdir(),'resume-api-')),'db.sqlite')
const {app,store,runtimeAi}=await import('../server/index')
let calls=0,mode='initial',context=''
runtimeAi.call=(async(_messages:any,validate:any)=>{calls++;context=JSON.stringify(_messages);return {data:validate(mode==='optimize'?optimized:mode==='comparison'?{added:['新增 100 条记录指标'],removed:[],modified:[],resolved:['指标已提供'],remaining:[],newProblems:[],nextActions:['补充方法'],evidence:['原文：100 条记录']}:initial),meta:{model:'test-model',provider:'test',inputTokens:1,cachedInputTokens:0,uncachedInputTokens:1,outputTokens:1,durationMs:1,estimatedCostCny:0}}}) as any

test('API auto-save, reload, related context, comparison, deletion and failure retry',async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
 const port=(server.address() as any).port;const base=`http://127.0.0.1:${port}`
 const api=async(path:string,method='GET',body?:any,headers?:any)=>{const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,...await res.json()}}
 try {
  const a=await api('/api/analyze-initial','POST',{...input,analysisId:'auto',resumeName:'简历',resumeVersion:'V1'});assert.equal(a.success,true);assert.ok(a.history.record);assert.equal(store.list().length,1)
  await api('/api/analyze-initial','POST',{...input,analysisId:'auto'});assert.equal(calls,1)
  const reload=await api('/api/history/auto');assert.deepEqual(reload.data.initial,initial)
  assert.equal((await api('/api/history')).data.length,1)
  assert.equal((await api('/api/history','GET',undefined,{Origin:'https://evil.example'})).status,403)
  assert.equal((await api('/api/memories/m','PUT',{text:'SQL',category:'技能',confirmed:false})).status,400)
  assert.equal((await api('/api/memories/m','PUT',{text:'SQL',category:'技能',confirmed:true})).success,true)
  await api('/api/analyze-initial','POST',{...input,analysisId:'new-session'});assert.match(context,/confirmed/);assert.match(context,/SQL/);assert.match(context,/缺少项目指标/)
  mode='optimize'
  const opt=await api('/api/optimize-resume','POST',{originalInput:input,initialAnalysis:initial,followUpAnswers:'我确认项目数据为100条',analysisId:'auto'})
  assert.equal(opt.success,true);assert.equal(store.get('auto')?.optimized?.finalAssessment.matchScore,60)
  assert.equal(store.get('auto')?.followUpAnswers,'我确认项目数据为100条')
  // A late initial-save retry cannot erase an already saved optimized report.
  await api('/api/history/auto','PUT',a.history.record);assert.ok(store.get('auto')?.optimized)
  await api('/api/history/b','PUT',record('b'));mode='comparison'
  const c=await api('/api/history/b/compare','POST',{baselineId:'auto'});assert.equal(c.data.comparison.added.length,1);assert.equal(c.data.initial.resumeDiagnosis.matchScore,60)
  // Failure must return the full report for durable browser retry.
  mode='initial';const save=store.save.bind(store);store.save=()=>{throw new Error('simulated full disk')}
  const failed=await api('/api/analyze-initial','POST',{...input,analysisId:'retry',resumeName:'简历',resumeVersion:'V2'})
  assert.equal(failed.success,true);assert.ok(failed.history.error);assert.deepEqual(failed.data,initial)
  store.save=save
  await api('/api/history/retry','PUT',failed.history.record);await api('/api/history/retry','PUT',failed.history.record);assert.equal(store.list().filter(r=>r.id==='retry').length,1)
  await api('/api/history/auto','DELETE');assert.equal((await api('/api/history/auto')).status,404);assert.equal((await api('/api/history/b')).data.comparison,undefined)
  assert.equal((await api('/api/history/auto','PUT',a.history.record)).status,400)
 }finally{server.close();store.close()}
})

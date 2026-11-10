import { useEffect, useState } from 'react'
import type { AnalysisRecord } from '../../types'
import { historyApi } from '../../services/pendingSaves'
export default function VersionComparison({record,onUpdate}:{record:AnalysisRecord;onUpdate:(r:AnalysisRecord)=>void}){
 const [baseline,setBaseline]=useState<AnalysisRecord>(),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{setBaseline(undefined);if(record.baselineId)historyApi<AnalysisRecord>(`/api/history/${record.baselineId}`).then(setBaseline).catch(e=>setError(e.message))},[record.baselineId])
 async function compare(){setBusy(true);setError('');try{onUpdate(await historyApi<AnalysisRecord>(`/api/history/${record.id}/compare`,'POST',{baselineId:record.baselineId}))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 if(!record.baselineId)return null
 const comparable=baseline&&baseline.input.targetRole===record.input.targetRole&&baseline.input.jdText===record.input.jdText&&baseline.rubric===record.rubric&&baseline.model===record.model
 return <section className="my-4 space-y-3 rounded border bg-white p-4"><h3 className="font-semibold">历史版本对比</h3>
 <p>基准：{baseline?.name} {baseline?.version}。评价标准：{record.rubric}，按 JD 门槛、经历证据、技能匹配、表达和真实性重新评分。历史报告保留各自评分依据。</p>
 {!comparable&&<p className="text-amber-700">岗位、JD、模型或评价标准不同（或基准尚未读取），评分变化可比性受限。</p>}
 {baseline&&<><p>岗位适配：{baseline.initial.roleFitAssessment.fitScore} → {record.initial.roleFitAssessment.fitScore}（变化 {record.initial.roleFitAssessment.fitScore-baseline.initial.roleFitAssessment.fitScore}）；岗位匹配：{baseline.initial.resumeDiagnosis.matchScore} → {record.initial.resumeDiagnosis.matchScore}（变化 {record.initial.resumeDiagnosis.matchScore-baseline.initial.resumeDiagnosis.matchScore}）</p><p>基准依据：{baseline.initial.resumeDiagnosis.scoreReasons.join('；')}</p><p>本次依据：{record.initial.resumeDiagnosis.scoreReasons.join('；')}</p>
 <details><summary>11 项文字维度评价变化</summary>{Object.entries(record.initial.resumeDiagnosis.dimensions).map(([k,v])=><p key={k}>{k}：{baseline.initial.resumeDiagnosis.dimensions[k as keyof typeof baseline.initial.resumeDiagnosis.dimensions]} → {v}</p>)}</details></>}
 <button disabled={busy} onClick={compare}>{busy?'对比中…':'分析版本变化（调用模型）'}</button>{error&&<p role="alert" className="text-red-600">{error}</p>}
 {record.comparison&&Object.entries(record.comparison).map(([k,v])=><div key={k}><h4 className="font-medium">{({added:'新增内容',removed:'删除内容',modified:'修改内容',resolved:'有证据支持已解决的问题',remaining:'仍存在或待核实的问题',newProblems:'新发现问题',nextActions:'下一轮建议',evidence:'判断依据'} as Record<string,string>)[k]}</h4><ul className="list-disc pl-5">{v.map((t,i)=><li key={i}>{t}</li>)}</ul></div>)}
 </section>
}

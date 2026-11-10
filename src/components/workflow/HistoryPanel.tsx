import { useEffect, useState } from 'react'
import type { AnalysisRecord, ProfileMemory } from '../../types'
import { historyApi, removePending } from '../../services/pendingSaves'

export default function HistoryPanel({onOpen,onReference,onDeleted}:{onOpen:(r:AnalysisRecord)=>void;onReference:(r:AnalysisRecord)=>void;onDeleted:(id:string)=>void}) {
  const [rows,setRows]=useState<AnalysisRecord[]>([]),[error,setError]=useState('')
  const [role,setRole]=useState(''),[version,setVersion]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState('')
  const load=()=>historyApi<AnalysisRecord[]>('/api/history').then(setRows).catch(e=>setError(e.message))
  useEffect(()=>{void load()},[])
  async function remove(r:AnalysisRecord) {
    if(!window.confirm(`删除 ${r.name} ${r.version} 的分析和相关摘要？`))return
    try {await removePending(r.id);await historyApi(`/api/history/${r.id}`,'DELETE');onDeleted(r.id);await load()}catch(e){setError((e as Error).message)}
  }
  return <section className="space-y-4 p-6"><h2 className="font-semibold">历史分析</h2>
    <p className="text-sm text-gray-500">本机单用户数据，按分析时间倒序排列。</p>
    <div className="flex flex-wrap gap-2"><input aria-label="目标岗位筛选" placeholder="目标岗位" value={role} onChange={e=>setRole(e.target.value)}/><input aria-label="版本筛选" placeholder="简历版本" value={version} onChange={e=>setVersion(e.target.value)}/><label>开始日期 <input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>结束日期 <input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><button onClick={load}>刷新列表</button></div>
    {error&&<p role="alert" className="text-red-600">{error}</p>}
    {rows.filter(r=>r.input.targetRole.includes(role)&&r.version.includes(version)&&(!from||localDate(r.createdAt)>=from)&&(!to||localDate(r.createdAt)<=to)).map(r=><article key={r.id} className="rounded border bg-white p-4"><p>{new Date(r.createdAt).toLocaleString()}｜{r.input.targetRole}｜{r.name} {r.version}</p><div className="mt-2 flex gap-4"><button onClick={()=>onOpen(r)}>查看完整报告</button><button onClick={()=>onReference(r)}>作为新分析参考 / 对比基准</button><button className="text-red-600" onClick={()=>remove(r)}>删除</button></div></article>)}
    {!rows.length&&<p>暂无历史分析。</p>}
  </section>
}
function localDate(s:string){const d=new Date(s);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}

export function MemoryPanel(){
 const [rows,setRows]=useState<ProfileMemory[]>([]),[text,setText]=useState(''),[category,setCategory]=useState('求职目标'),[id,setId]=useState(''),[confirmed,setConfirmed]=useState(false),[error,setError]=useState('')
 const load=()=>historyApi<ProfileMemory[]>('/api/memories').then(setRows).catch(e=>setError(e.message))
 useEffect(()=>{void load()},[])
 async function save(){try{await historyApi(`/api/memories/${id||crypto.randomUUID()}`,'PUT',{text,category,confirmed});setText('');setId('');setConfirmed(false);await load()}catch(e){setError((e as Error).message)}}
 return <section className="space-y-4 p-6"><h2 className="font-semibold">长期记忆 · 用户已确认信息</h2><p>仅添加你明确确认的事实。AI 分析建议不会自动进入画像。新分析会读取相关历史问题并重新判断。</p>
 <select value={category} onChange={e=>setCategory(e.target.value)}>{['求职目标','目标行业','意向岗位','实习经历','技能','认可的修改方向','求职偏好'].map(c=><option key={c}>{c}</option>)}</select>
 <textarea aria-label="记忆内容" className="block w-full rounded border p-2" value={text} onChange={e=>setText(e.target.value)} maxLength={2000}/>
 <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我确认以上信息真实并同意用于后续分析</label> <button onClick={save}>保存记忆</button>
 {error&&<p role="alert" className="text-red-600">{error}</p>}
 {rows.map(m=><article key={m.id} className="rounded border p-3"><p>{m.category}：{m.text}</p><button onClick={()=>{setId(m.id);setText(m.text);setCategory(m.category);setConfirmed(false)}}>编辑</button> <button onClick={async()=>{try{await historyApi(`/api/memories/${m.id}`,'DELETE');await load()}catch(e){setError((e as Error).message)}}}>删除</button></article>)}
 </section>
}

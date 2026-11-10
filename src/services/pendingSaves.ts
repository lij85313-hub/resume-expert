import type { AnalysisRecord } from '../types'
export async function historyApi<T>(url: string, method='GET', payload?: unknown): Promise<T> {
  const response=await fetch(url,{method,signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},...(payload===undefined?{}:{body:JSON.stringify(payload)})})
  const body=await response.json()
  if (!response.ok || !body.success) throw new Error(body.error || '数据操作失败')
  return body.data
}
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open('resume-expert-pending',1)
    r.onupgradeneeded=()=>r.result.createObjectStore('records',{keyPath:'id'})
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('本地暂存不可用，请下载报告备份'))
  })
}
async function transact<T>(mode: IDBTransactionMode, fn:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T> {
  const db=await openDB()
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('records',mode), request=fn(tx.objectStore('records'))
    tx.oncomplete=()=>{db.close();resolve(request.result)}
    tx.onabort=()=>{db.close();reject(new Error('本地暂存失败，请下载报告备份'))}
    tx.onerror=()=>{db.close();reject(new Error('本地暂存失败，请下载报告备份'))}
  })
}
export const pendingRecords=()=>transact('readonly',s=>s.getAll()) as Promise<AnalysisRecord[]>
export const removePending=(id:string)=>transact('readwrite',s=>s.delete(id))
export async function saveRecord(record:AnalysisRecord):Promise<AnalysisRecord> {
  // Write to the browser first, so a server outage does not lose a successful report.
  let staged=false
  try {await transact('readwrite',s=>s.put(record)); staged=true} catch { /* server may still work */ }
  try {
    const saved=await historyApi<AnalysisRecord>(`/api/history/${record.id}`,'PUT',record)
    if (staged) await removePending(record.id)
    return saved
  } catch { throw new Error(staged?'保存失败，报告已在此浏览器暂存；请重试保存。':'服务器和本地暂存均失败，请立即下载报告备份。') }
}

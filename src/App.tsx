import type { AnalysisRecord } from './types'
import HistoryPanel, { MemoryPanel } from './components/workflow/HistoryPanel'
import VersionComparison from './components/workflow/VersionComparison'
import { historyApi, pendingRecords, saveRecord } from './services/pendingSaves'
import { useEffect, useState } from 'react'
import type {
  AnalyzeInitialRequest,
  AnalyzeInitialResponse,
  OptimizeResumeResponse,
  EvaluateInterviewAnswerResponse
} from './types'
import { analyzeInitial, createCostChainId, optimizeResume } from './services/api'
import { validateInput } from './utils/validators'
import { buildMarkdown, downloadMarkdown } from './utils/exportMarkdown'
import AppLayout from './components/layout/AppLayout'
import TopNav, { STEPS } from './components/layout/TopNav'
import Sidebar from './components/layout/Sidebar'
import LoadingState from './components/common/LoadingState'
import ErrorState from './components/common/ErrorState'
import InputMaterials from './components/workflow/InputMaterials'
import JDAnalysisView from './components/workflow/JDAnalysis'
import ResumeDiagnosisView from './components/workflow/ResumeDiagnosis'
import MatchAnalysis from './components/workflow/MatchAnalysis'
import FollowUpQuestions from './components/workflow/FollowUpQuestions'
import ResumeStrategyView from './components/workflow/ResumeStrategy'
import RewriteComparison from './components/workflow/RewriteComparison'
import FinalResumeView from './components/workflow/FinalResume'
import InterviewAndFurther from './components/workflow/InterviewAndFurther'
import MockInterview from './components/workflow/MockInterview'

const EMPTY_INPUT: AnalyzeInitialRequest = {
  targetRole: '',
  targetIndustry: '',
  targetCompanyType: '',
  targetApplicationScenario: '',
  graduationStage: '',
  educationLevel: '',
  major: '',
  highlightAbilities: '',
  jdText: '',
  resumeText: '',
  internshipExperience: '',
  projectExperience: '',
  campusExperience: '',
  researchExperience: '',
  competitionExperience: '',
  skillsAndCertificates: '',
  measurableResults: '',
  avoidExaggeration: '',
  resumeLength: '一页'
}

type Phase = 'initial' | 'optimize'

export default function App() {
  const [input, setInput] = useState<AnalyzeInitialRequest>(EMPTY_INPUT)
  const [initial, setInitial] = useState<AnalyzeInitialResponse | null>(null)
  const [optimize, setOptimize] = useState<OptimizeResumeResponse | null>(null)
  const [followUpAnswers, setFollowUpAnswers] = useState('')
  const [mockAnswers, setMockAnswers] = useState<Record<string, string>>({})
  const [mockEvaluations, setMockEvaluations] = useState<Record<string, EvaluateInterviewAnswerResponse>>({})

  const [loadingPhase, setLoadingPhase] = useState<Phase | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorPhase, setErrorPhase] = useState<Phase | null>(null)
  const [inputError, setInputError] = useState<string | null>(null)

  const [activeStep, setActiveStep] = useState(-1)
  const [maxReached, setMaxReached] = useState(0) // 可达步骤数
  const [costChainId, setCostChainId] = useState('')

  const [page,setPage]=useState<'analysis'|'history'|'memory'>('analysis')
  const [record,setRecord]=useState<AnalysisRecord|null>(null)
  const [name,setName]=useState('我的简历'),[version,setVersion]=useState('V1'),[baselineId,setBaselineId]=useState<string>()
  const [attempt,setAttempt]=useState<{key:string;id:string}|null>(null)
  const [saveStatus,setSaveStatus]=useState(''),[pending,setPending]=useState<AnalysisRecord[]>([])
  useEffect(()=>{pendingRecords().then(setPending).catch(e=>setSaveStatus(e.message))},[])
  async function persist(r:AnalysisRecord) {
    setRecord(r);setSaveStatus('正在保存…')
    try{const saved=await saveRecord(r);setRecord(saved);setSaveStatus('已保存到本机');setPending(p=>p.filter(x=>x.id!==r.id))}
    catch(e){setSaveStatus((e as Error).message);setPending(p=>[...p.filter(x=>x.id!==r.id),r])}
  }
  function restore(r:AnalysisRecord) {
    setRecord(r);setInput(r.input);setInitial(r.initial);setOptimize(r.optimized||null)
    setFollowUpAnswers(r.followUpAnswers||'');setMockAnswers(r.mockAnswers||{});setMockEvaluations(r.mockEvaluations||{})
    setName(r.name);setVersion(r.version);setBaselineId(r.baselineId);setMaxReached(r.optimized?STEPS.length:5);setActiveStep(0);setError(null);setPage('analysis');setSaveStatus('')
  }
  function reference(r:AnalysisRecord) {
    setBaselineId(r.id);setName(r.name);setVersion(`${r.version}-新版`);setPage('analysis')
  }
  function backup() {
    if(!record)return
    const url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}))
    const a=document.createElement('a');a.href=url;a.download='简历分析备份.json';a.click();URL.revokeObjectURL(url)
  }

  const patchInput = (patch: Partial<AnalyzeInitialRequest>) => {
    setInput((prev) => ({ ...prev, ...patch }))
    setInputError(null)
  }

  async function handleAnalyze() {
    const verr = validateInput(input)
    if (verr) {
      setInputError(verr)
      return
    }
    setLoadingPhase('initial')
    setError(null)
    setErrorPhase(null)
    const chainId = createCostChainId()
    setCostChainId(chainId)
    try {
      const key=JSON.stringify({input,name,version,baselineId})
      const analysisId=attempt?.key===key?attempt.id:crypto.randomUUID()
      setAttempt({key,id:analysisId})
      const res = await analyzeInitial({...input,analysisId,resumeName:name,resumeVersion:version,baselineId}, chainId)
      const savedRecord=res.history?.record || {id:analysisId,createdAt:new Date().toISOString(),name,version,input,initial:res.data,baselineId,rubric:'campus-evidence-v1',model:res.meta?.model||'unknown'}
      await persist(savedRecord)
      setFollowUpAnswers('')
      setInitial(res.data)
      setOptimize(null)
      setMockAnswers({})
      setMockEvaluations({})
      setMaxReached(5) // 步骤 0-4 可达（校招JD解析→优化策略）
      setActiveStep(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : '初始分析失败，请重试。')
      setErrorPhase('initial')
    } finally {
      setLoadingPhase(null)
    }
  }

  async function handleOptimize() {
    if (!initial) return
    setLoadingPhase('optimize')
    setError(null)
    setErrorPhase(null)
    try {
      const res = await optimizeResume(
        {
          originalInput: record?.input || input,
          initialAnalysis: initial,
          followUpAnswers, analysisId:record?.id, historyRecord:record || undefined
        },
        costChainId || createCostChainId()
      )
      if(record) await persist(res.history?.record || {...record,optimized:res.data,followUpAnswers})
      setOptimize(res.data)
      setMaxReached(STEPS.length) // 全部步骤可达
      setActiveStep(5)
    } catch (e) {
      setError(e instanceof Error ? e.message : '深度优化失败，请重试。')
      setErrorPhase('optimize')
    } finally {
      setLoadingPhase(null)
    }
  }

  function handleExport() {
    if (!initial || !optimize) return
    const md = buildMarkdown(input, initial, optimize, mockEvaluations)
    const name = `${input.targetRole || '应届生简历'}-校招优化报告.md`
    downloadMarkdown(name, md)
  }

  function renderRightPanel() {
    if (loadingPhase === 'initial') return <LoadingState message="正在调用 AI 进行校招初始分析…" />
    if (loadingPhase === 'optimize') return <LoadingState message="正在调用 AI 进行深度优化…" />

    if (error && errorPhase) {
      const retry = errorPhase === 'initial' ? handleAnalyze : handleOptimize
      return <ErrorState message={error} onRetry={retry} />
    }

    if (!initial) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <p className="text-base font-medium text-gray-400">尚未生成分析结果</p>
          <p className="text-sm text-gray-400">请在左侧填写应届生求职材料并点击「开始分析」。</p>
        </div>
      )
    }

    switch (activeStep) {
      case 0:
        return <JDAnalysisView data={initial.jdAnalysis} requirementLevels={initial.jdRequirementLevels} />
      case 1:
        return (
          <ResumeDiagnosisView
            data={initial.resumeDiagnosis}
            roleFit={initial.roleFitAssessment}
            noReply={initial.noReplyDiagnosis}
          />
        )
      case 2:
        return <MatchAnalysis data={initial.matchTable} />
      case 3:
        return (
          <FollowUpQuestions
            data={initial.followUpQuestions}
            answers={followUpAnswers}
            onAnswersChange={setFollowUpAnswers}
            onOptimize={handleOptimize}
            loading={loadingPhase === 'optimize'}
          />
        )
      case 4:
        return (
          <ResumeStrategyView
            data={initial.resumeStrategy}
            transferability={initial.experienceTransferability}
          />
        )
      case 5:
        return optimize ? <RewriteComparison data={optimize.rewriteComparison} /> : null
      case 6:
        return optimize ? (
          <FinalResumeView
            data={optimize.finalResume}
            assessment={optimize.finalAssessment}
            initialFitScore={initial.roleFitAssessment.fitScore}
            initialMatchScore={initial.resumeDiagnosis.matchScore}
          />
        ) : null
      case 7:
        return optimize ? (
          <InterviewAndFurther
            interviewRisks={optimize.interviewRisks}
            further={optimize.furtherSuggestions}
            skillGap={initial.skillGapPlan}
            onExport={handleExport}
          />
        ) : null
      case 8:
        return optimize ? (
          <MockInterview
            plan={optimize.mockInterviewPlan}
            originalInput={input}
            initialAnalysis={initial}
            optimizedResult={optimize}
            answers={mockAnswers}
            onAnswerChange={(id, text) => setMockAnswers((p) => ({ ...p, [id]: text }))}
            evaluations={mockEvaluations}
            onEvaluated={(id, result) => {setMockEvaluations((p) => ({ ...p, [id]: result }));if(record)void persist({...record,mockAnswers,mockEvaluations:{...mockEvaluations,[id]:result}})}}
            onExport={handleExport}
            costChainId={costChainId}
          />
        ) : null
      default:
        return null
    }
  }

  const stepLabel = activeStep >= 0 ? STEPS[activeStep]?.label : ''

  return (
    <AppLayout>
      <div className="flex flex-wrap gap-4 border-b bg-white px-6 py-3">
        <button onClick={()=>setPage('analysis')}>当前分析</button><button disabled={!!loadingPhase} onClick={()=>setPage('history')}>历史分析</button><button onClick={()=>setPage('memory')}>长期记忆</button>
        <button disabled={!!loadingPhase} onClick={()=>{setAttempt(null);setRecord(null);setInitial(null);setOptimize(null);setInput(EMPTY_INPUT);setActiveStep(-1);setMaxReached(0);setBaselineId(undefined);setFollowUpAnswers('');setMockAnswers({});setMockEvaluations({});setError(null);setSaveStatus('');setPage('analysis')}}>新会话</button>
      </div>
      {pending.length>0&&<div className="bg-amber-50 p-3"><p>发现尚未保存的报告：</p>{pending.map(r=><div key={r.id}>{r.name} {r.version} <button onClick={()=>restore(r)}>恢复报告</button> <button onClick={()=>persist(r)}>重试保存</button></div>)}</div>}
      {page==='history'?<HistoryPanel onOpen={restore} onReference={reference} onDeleted={id=>{if(record?.id===id){setRecord(null);setInitial(null);setOptimize(null)}if(baselineId===id)setBaselineId(undefined);setPending(p=>p.filter(x=>x.id!==id))}}/>:page==='memory'?<MemoryPanel/>:<>
      <TopNav activeIndex={activeStep} maxReachedIndex={maxReached} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar>
          <div className="mb-4 space-y-2"><label>简历名称<input className="block w-full rounded border p-2" value={name} maxLength={120} onChange={e=>setName(e.target.value)}/></label><label>简历版本<input className="block w-full rounded border p-2" value={version} maxLength={60} onChange={e=>setVersion(e.target.value)}/></label>{baselineId&&<p>已选择历史参考 / 对比基准 <button onClick={()=>setBaselineId(undefined)}>取消</button></p>}</div>
          <InputMaterials
            value={input}
            onChange={patchInput}
            onAnalyze={handleAnalyze}
            loading={loadingPhase === 'initial'}
          />
          {inputError && (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{inputError}</p>
          )}
        </Sidebar>

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-gray-200 bg-white px-6 py-3">
            <h2 className="text-sm font-semibold text-gray-900">
              {stepLabel || '结果展示区'}
            </h2>
          </div>
          <div className="p-6">{record&&<div className="mb-4 rounded border p-3"><p role="status">{saveStatus}</p><button onClick={()=>persist({...record,followUpAnswers,mockAnswers,mockEvaluations})}>重试 / 保存当前进度</button> <button onClick={backup}>下载完整报告备份</button><IssueStatus id={record.id}/></div>}{renderRightPanel()}{record&&<VersionComparison record={record} onUpdate={setRecord}/>}</div>

          {initial && !loadingPhase && !error && (
            <StepPager activeStep={activeStep} maxReached={maxReached} onChange={setActiveStep} />
          )}
        </div>
      </div>
    </>}
    </AppLayout>
  )
}

// 步骤翻页器
function StepPager({
  activeStep,
  maxReached,
  onChange
}: {
  activeStep: number
  maxReached: number
  onChange: (i: number) => void
}) {
  if (activeStep < 0) return null
  const prev = activeStep > 0 ? activeStep - 1 : -1
  const next = activeStep < maxReached - 1 ? activeStep + 1 : -1
  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-3">
      <button
        disabled={prev < 0}
        onClick={() => prev >= 0 && onChange(prev)}
        className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
      >
        ← 上一步
      </button>
      <span className="text-xs text-gray-400">
        {activeStep + 1} / {maxReached}
      </span>
      <button
        disabled={next < 0 || next >= maxReached}
        onClick={() => next >= 0 && next < maxReached && onChange(next)}
        className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
      >
        下一步 →
      </button>
    </div>
  )
}

function IssueStatus({id}:{id:string}) {
 const [rows,setRows]=useState<{id:string;text:string;status:string}[]>([])
 const [error,setError]=useState('')
 useEffect(()=>{historyApi<typeof rows>(`/api/history/${id}/issues`).then(setRows).catch(()=>setRows([]))},[id])
 return <details className="mt-2"><summary>历史问题跟进（已修改为用户自报，后续分析仍需核实）</summary>{error&&<p>{error}</p>}{rows.map(r=><label key={r.id} className="block"><input type="checkbox" checked={r.status==='user-reported-fixed'} onChange={async e=>{const status=e.target.checked?'user-reported-fixed':'open';try{await historyApi(`/api/issues/${r.id}`,'PUT',{status});setRows(p=>p.map(x=>x.id===r.id?{...x,status}:x))}catch(e){setError((e as Error).message)}}}/>{r.text}</label>)}</details>
}

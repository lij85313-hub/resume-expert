import {test,expect} from '@playwright/test'
import {record} from '../fixtures'
test('history reload, complete report, reference, compare, memory edit and deletion',async({page})=>{
 const rows=new Map([['a',record('a')],['b',{...record('b'),version:'V2',baselineId:'a'}]])
 const memories=new Map<string,any>()
 await page.route('**/api/**',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname,method=req.method();let data:any={}
  if(p==='/api/history')data=[...rows.values()].reverse()
  else if(p==='/api/memories')data=[...memories.values()]
  else if(p.startsWith('/api/memories/')){const id=p.split('/').pop()!;if(method==='PUT')memories.set(id,{id,...req.postDataJSON()});else memories.delete(id)}
  else if(p.endsWith('/compare')) {const r=rows.get('b')!;data={...r,comparison:{added:['SQL 新增指标'],removed:[],modified:[],resolved:[],remaining:[],newProblems:[],nextActions:['补证据'],evidence:['原文 SQL']}};rows.set('b',data)}
  else if(p.endsWith('/issues'))data=[]
  else if(p.startsWith('/api/history/')){const id=p.split('/').pop()!;if(method==='DELETE')rows.delete(id);else if(method==='PUT'){data=req.postDataJSON();rows.set(id,data)}else data=rows.get(id)}
  await route.fulfill({json:{success:true,data}})
 })
 await page.goto('/');await page.getByRole('button',{name:'历史分析',exact:true}).click()
 await expect(page.getByRole('article')).toHaveCount(2)
 await page.reload();await page.getByRole('button',{name:'历史分析',exact:true}).click()
 await page.getByRole('button',{name:'查看完整报告'}).first().click()
 await expect(page.getByText('有证据',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'分析版本变化（调用模型）'}).click()
 await expect(page.getByText('SQL 新增指标',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'新会话',exact:true}).click()
 await page.getByRole('button',{name:'历史分析',exact:true}).click()
 await page.getByRole('button',{name:'作为新分析参考 / 对比基准'}).first().click()
 await expect(page.getByText('已选择历史参考 / 对比基准')).toBeVisible()
 await page.getByRole('button',{name:'长期记忆',exact:true}).click()
 await page.getByRole('textbox',{name:'记忆内容'}).fill('我已掌握 SQL')
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'保存记忆'}).click()
 await expect(page.getByText('技能：我已掌握 SQL')).toHaveCount(0)
 await expect(page.getByText('求职目标：我已掌握 SQL')).toBeVisible()
 await page.getByRole('button',{name:'编辑',exact:true}).click();await page.getByRole('textbox',{name:'记忆内容'}).fill('希望找数据实习');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'保存记忆'}).click();await expect(page.getByText('求职目标：希望找数据实习')).toBeVisible()
 await page.getByRole('button',{name:'删除',exact:true}).click();await expect(page.getByText('求职目标：希望找数据实习')).toHaveCount(0)
 await page.getByRole('button',{name:'历史分析',exact:true}).click();page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'删除',exact:true}).first().click();await expect(page.getByRole('article')).toHaveCount(1)
 await page.screenshot({path:'tests/browser-history.png',fullPage:true})
})

test('analysis save failure survives browser refresh and retry does not rerun model',async({page})=>{
 let analyses=0,fail=true;const rows=new Map<string,any>()
 await page.route('**/api/**',async route=>{
  const req=route.request(),p=new URL(req.url()).pathname;let data:any={}
  if(p==='/api/analyze-initial'){
   analyses++;const body=req.postDataJSON();const r={...record(body.analysisId),input:body,name:body.resumeName,version:body.resumeVersion}
   await route.fulfill({json:{success:true,data:r.initial,history:{record:r,error:'保存失败'}}});return
  }
  if(p.startsWith('/api/history/')&&req.method()==='PUT'){
   if(fail){await route.fulfill({status:500,json:{success:false,error:'模拟磁盘故障'}});return}
   data=req.postDataJSON();rows.set(data.id,data)
  }else if(p==='/api/history')data=[...rows.values()]
  else if(p.endsWith('/issues'))data=[]
  await route.fulfill({json:{success:true,data}})
 })
 await page.goto('/')
 for(const text of ['数据分析师','互联网','大厂','日常实习','大三找暑期实习','本科'])await page.getByRole('button',{name:text,exact:true}).click()
 await page.getByPlaceholder('如：计算机/产品/统计').fill('统计')
 await page.getByLabel('希望简历突出',{exact:true}).fill('SQL 分析')
 await page.getByLabel('目标校招岗位 JD',{exact:true}).fill('数据分析实习岗位，需要 SQL 和 Python 进行数据分析和报告工作。')
 await page.getByLabel('原始简历',{exact:true}).fill('统计本科大三，有 SQL 课程项目，负责清洗和分析 100 条数据，使用 Python 绘图并撰写报告。')
 await page.getByRole('button',{name:'开始分析',exact:true}).click()
 await expect(page.getByRole('status')).toContainText('暂存')
 await page.reload();await expect(page.getByText('发现尚未保存的报告：')).toBeVisible()
 await page.getByRole('button',{name:'恢复报告',exact:true}).click();await expect(page.getByText('有证据',{exact:true})).toBeVisible()
 fail=false;await page.getByRole('button',{name:'重试 / 保存当前进度',exact:true}).click()
 await expect(page.getByRole('status')).toContainText('已保存到本机');expect(analyses).toBe(1);expect(rows.size).toBe(1)
 await page.getByRole('button',{name:'历史分析',exact:true}).click();await expect(page.getByRole('article')).toHaveCount(1)
})

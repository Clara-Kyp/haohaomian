import { validateReportReview, dimensionIds } from '../dist/report-review.js'
import { expect, test, type APIRequestContext } from '@playwright/test'

const profile = { id: 'test-resume', name: '产品经理简历', role: '产品经理', text: '负责需求调研与产品规划。' }
test.beforeEach(async ({request}) => {
  const current = await (await request.get('/api/workspace')).json()
  if (!current.state) await request.put('/api/workspace', {data:{version:current.version,state:{
    page:'练习',stage:'导入',tab:'手动输入',questions:[],active:0,jd:'',link:'',raw:'',screenshots:[],
    resumes:[profile],practiceProfile:profile,goalConfirmed:true,selectedResume:0,resumeIndex:-1,originalAudio:'',originalName:'',segments:[],confirmed:false,
    report:[],reportKind:'练习',reports:[],questionId:0,stale:false,evidence:0,missing:null,skipped:[],
  }}})
})


test('工作台题单、默认维度、整场报告和采纳新版可跨刷新恢复', async ({ page }) => {
  await page.route('**/api/workspace/ai/*', async route => {
    const task = route.request().url().split('/').at(-1)
    const { input } = route.request().postDataJSON()
    switch (task) {
      case 'coverage': return route.fulfill({ json: { missing: [5] } })
      case 'score': return route.fulfill({ json: { rows: Array.from({ length: 6 }, (_,i) => (i===5?{status:'insufficient_evidence',score:null}:{
        score: 80, answerId: input.answers[0].id, quote: input.answers[0].transcript, tip: '补充验证结果。',
      })) } })
      case 'coach': return route.fulfill({ json: { guidance: '先给出结论，再说明验证过程。' } })
      default: return route.abort()
    }
  })
  await page.goto('/workspace-prototype')
  if (await page.getByRole('button',{name:'确认目标，导入材料',exact:true}).isVisible()) { await page.getByLabel('本场简历与目标岗位（必选）',{exact:true}).selectOption('0'); await page.getByRole('button',{name:'确认目标，导入材料',exact:true}).click() }
  await page.getByLabel('已有面试题').fill('如何验证项目成果？')
  await page.getByRole('button', { name: '使用这些题目' }).click()
  await page.getByRole('button', { name: '确认并开始练习' }).click()
  await page.getByLabel('本题答案').fill('我以一次可控试验验证结果。')
  await page.getByRole('button', { name: '结束并检查评分维度' }).click()
  await page.getByRole('button', { name: '生成整场报告' }).click()
  await expect(page.getByText('78.60')).toBeVisible()
  await expect(page.getByText('权重 7% · 未覆盖 · 默认分')).toBeVisible()
  await expect(page.getByText('我以一次可控试验验证结果。', { exact: true })).toBeVisible()
  await page.getByRole('button',{name:'返回作答修改',exact:true}).first().click()
  await page.getByRole('tab',{name:'重答辅导',exact:true}).click()
  await page.getByText('获取改进思路',{exact:true}).click()
  await page.getByLabel('希望改进的地方').fill('没有说明筛选指标的依据')
  await page.getByRole('button', { name: '生成重答框架' }).click()
  await expect(page.getByText('先给出结论，再说明验证过程。')).toBeVisible()
  await page.getByLabel('重答草稿（尚未采用）').fill('我以故障率为指标，对照两周数据。')
  const saved = page.waitForResponse(response => response.url().endsWith('/api/workspace') && response.request().method() === 'PUT' && response.request().postDataJSON().state.stale)
  await page.getByRole('button', { name: '保存为当前答案' }).click()
  expect((await saved).ok()).toBeTruthy()
  await page.reload()
  await page.getByRole('button',{name:/报告$/}).first().click()
  await expect(page.getByRole('button', { name: '重新评估整场' })).toBeVisible()
  await expect(page.getByText('作答已更新 · 等待手动重评')).toBeVisible()
})

test('简历原文件与提取文本持久化，上传音频可以回放并手动整理', async ({ page, request }) => {
  const initial = await (await request.get('/api/workspace')).json()
  if (initial.state) await request.put('/api/workspace', { data: { version: initial.version, state: { ...initial.state, page: '练习' } } })
  await page.goto('/workspace')
  await page.getByRole('button', { name: '简历库' }).click()
  await page.getByRole('button', { name: '新增简历' }).click()
  await page.getByLabel('简历名称').fill('后端简历')
  const saved = page.waitForResponse(response => response.url().endsWith('/api/workspace') && response.request().method() === 'PUT' &&
    response.request().postDataJSON().state.resumes.some((item: { text: string }) => item.text === '项目经验：后端开发'))
  await page.getByLabel('上传简历文件（选填）', { exact: true }).setInputFiles({ name: 'resume.txt', mimeType: 'text/plain', buffer: Buffer.from('项目经验：后端开发') })
  await expect(page.getByLabel('简历正文（必填，可编辑）')).toHaveValue('项目经验：后端开发')
  expect((await saved).ok()).toBeTruthy()
  await page.reload()
  await expect(page.getByLabel('简历正文（必填，可编辑）')).toHaveValue('项目经验：后端开发')
  const resume = page.getByRole('link', { name: '查看原文件' })
  const asset = await request.get((await resume.getAttribute('href'))!)
  expect(await asset.text()).toBe('项目经验：后端开发')

  const wav = Buffer.alloc(44 + 16000)
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40)
  await page.getByRole('button', { name: '录音复盘' }).click()
  await page.getByLabel('上传录音文件').setInputFiles({ name: 'meeting.wav', mimeType: 'audio/wav', buffer: wav })
  await expect(page.locator('audio')).toBeVisible()
  await page.getByRole('button', { name: '新增文字段落' }).click()
  await page.getByLabel('说话人').selectOption('候选人')
  await page.getByLabel('第 1 段文字').fill('这是校对后的回答。')
  await page.getByLabel('本场简历与目标岗位（必选）').selectOption('0')
  await page.getByRole('button', { name: '确认文字稿，检查评分维度' }).click()
  await expect(page.getByRole('heading', { name: '评分前检查' })).toBeVisible()
})

test('移除小红书导入入口，旧链接草稿回到参考资料且保留JD', async ({ page,request }) => {
  await setWorkspace(request,{page:'练习',stage:'导入',tab:'小红书链接',raw:'原有资料',jd:'原有岗位要求',link:'https://www.xiaohongshu.com/explore/123'})
  let calls=0;await page.route('**/api/workspace/ai/*',route=>{calls++;return route.abort()})
  await page.goto('/workspace')
  await expect(page.getByRole('button',{name:'小红书链接',exact:true})).toHaveCount(0)
  await expect(page.getByLabel('小红书分享链接')).toHaveCount(0)
  await expect(page.getByLabel('输入内容类型')).toHaveValue('参考资料')
  await expect(page.getByLabel('出题参考资料',{exact:true})).toHaveValue('原有资料')
  await expect(page.getByLabel('岗位描述（JD）（选填）',{exact:true})).toHaveValue('原有岗位要求')
  await page.getByRole('button',{name:'截图',exact:true}).click()
  await expect(page.getByLabel('上传面经或岗位截图')).toBeVisible()
  await page.getByRole('button',{name:'根据 JD 出题',exact:true}).click()
  await expect(page.getByLabel('岗位描述（JD）（必填）',{exact:true})).toHaveValue('原有岗位要求')
  expect(calls).toBe(0)
})

test('手动录下原声后，未配置转写仍可回放、填写和结束', async ({ page, request }) => {
  const { version } = await (await request.get('/api/workspace')).json()
  const fresh = { page: '练习', stage: '导入', tab: '手动输入', questions: [], active: 0, jd: '', link: '', raw: '', screenshots: [],
    resumes: [profile], practiceProfile: profile, resumeIndex: -1, selectedResume: 0, originalAudio: '', originalName: '', segments: [], confirmed: false,
    report: [], reportKind: '练习', reports: [], questionId: 0, stale: false, evidence: 0, missing: null, skipped: [] }
  expect((await request.put('/api/workspace', { data: { version, state: fresh } })).ok()).toBeTruthy()
  await page.goto('/workspace-prototype')
  if (await page.getByRole('button',{name:'确认目标，导入材料',exact:true}).isVisible()) { await page.getByLabel('本场简历与目标岗位（必选）',{exact:true}).selectOption('0'); await page.getByRole('button',{name:'确认目标，导入材料',exact:true}).click() }
  await page.getByLabel('已有面试题').fill('你怎样定位故障？')
  await page.getByRole('button', { name: '使用这些题目' }).click()
  await page.getByRole('button', { name: '确认并开始练习' }).click()
  await page.getByRole('button', { name: '开始录音' }).click()
  const stop = page.getByRole('button', { name: '停止录音' })
  await expect(stop).toBeVisible()
  // Let the fake device emit audio before stopping.
  await page.waitForTimeout(350)
  await stop.click()
  await expect(page.getByRole('button', { name: '重试转写' })).toBeVisible()
  const url = (await page.locator('audio').getAttribute('src'))!
  expect((await request.get(url, { headers: { Range: 'bytes=0-20' } })).status()).toBe(206)
  await page.getByLabel('本题答案').fill('我先复现，再核对告警与日志。')
  await page.getByRole('button', { name: '结束并检查评分维度' }).click()
  await expect(page.getByRole('heading', { name: '评分前检查' })).toBeVisible()
})

test('模型密钥写入后只返回配置状态，同服务可复用凭据', async ({ request }) => {
  const settings = { provider: 'dashscope', model: 'qwen3-vl-plus', speech: 'paraformer-realtime-v2', shared: true, modelKey: 'test-workspace-key' }
  expect((await request.put('/api/workspace/settings', { data: { ...settings, provider: 'openai' } })).status()).toBe(400)
  expect((await request.put('/api/workspace/settings', { data: settings })).ok()).toBeTruthy()
  const response = await (await request.get('/api/workspace')).text()
  expect(response).not.toContain(settings.modelKey)
  expect(JSON.parse(response).settings).toMatchObject({ modelConfigured: true, speechConfigured: true, shared: true })
})

test('MiniMax 支持同一密钥配置文字和转写，并按地域隔离旧凭据', async ({ request }) => {
  const settings = { provider: 'minimax', region: 'cn', model: 'MiniMax-M3.1-Flash', speech: 'asr-1.0', shared: true, modelKey: 'minimax-test-only' }
  expect((await request.put('/api/workspace/settings', { data: settings })).ok()).toBeTruthy()
  const configured = await (await request.get('/api/workspace')).text()
  expect(configured).not.toContain(settings.modelKey)
  expect(JSON.parse(configured).settings).toMatchObject({ provider: 'minimax', region: 'cn', modelConfigured: true, speechConfigured: true })
  expect((await request.put('/api/workspace/settings', { data: { ...settings, region: 'global', modelKey: undefined } })).ok()).toBeTruthy()
  expect((await (await request.get('/api/workspace')).json()).settings).toMatchObject({ region: 'global', modelConfigured: false, speechConfigured: false })
})

test('追问显示等待反馈，失败可重试，成功进入新增题目', async ({ page, request }) => {
  const { version } = await (await request.get('/api/workspace')).json()
  const state = { page: '练习', stage: '练习', tab: '手动输入', questions: [{ id: 1, text: '介绍一个项目。', source: '手动输入', transcript: '' }],
    active: 0, jd: '', link: '', raw: '', screenshots: [], resumes: [profile], practiceProfile: profile, resumeIndex: -1, selectedResume: 0,
    originalAudio: '', originalName: '', segments: [], confirmed: false, report: [], reportKind: '练习', reports: [],
    questionId: 1, stale: false, evidence: 0, missing: null, skipped: [] }
  expect((await request.put('/api/workspace', { data: { version, state } })).ok()).toBeTruthy()
  await page.goto('/workspace')
  const follow = page.getByRole('button', { name: '生成一道追问', exact: true })
  await follow.click()
  await expect(page.getByRole('alert')).toContainText('请先填写本题答案')
  await page.getByLabel('本题答案').fill('我用对照试验验证了结果。')
  let resolveResponse: () => void = () => {}
  let failed = true
  await page.route('**/api/workspace/ai/followup', async route => {
    await new Promise<void>(resolve => { resolveResponse = resolve })
    await route.fulfill(failed ? { status: 502, json: { error: '服务暂时不可用，请重试。' } } : { json: { question: '你如何控制试验变量？' } })
  })
  await follow.click()
  await expect(page.getByRole('button', { name: '正在生成追问…', exact: true })).toBeDisabled()
  resolveResponse()
  await expect(page.getByRole('alert')).toContainText('服务暂时不可用')
  failed = false
  await follow.click()
  await expect(page.getByRole('button', { name: '正在生成追问…', exact: true })).toBeDisabled()
  resolveResponse()
  await expect(page.getByRole('heading', { name: '你如何控制试验变量？' })).toBeVisible()
  await expect(page.getByText('第 2 / 2 题', { exact: false })).toBeVisible()
})

test('报告生成期间显示等待，失败原因保留且可以重试', async ({ page, request }) => {
  const {version}=await(await request.get('/api/workspace')).json()
  const state={page:'练习',stage:'覆盖',tab:'手动输入',questions:[{id:1,text:'介绍一个项目。',source:'手动输入',transcript:'我通过对照实验验证结果。'}],
    active:0,jd:'',link:'',raw:'',screenshots:[],resumes:[profile],practiceProfile:profile,resumeIndex:-1,selectedResume:0,originalAudio:'',originalName:'',segments:[],confirmed:false,report:[],reportKind:'练习',reports:[],questionId:1,stale:false,evidence:0,missing:[],skipped:[]}
  expect((await request.put('/api/workspace',{data:{version,state}})).ok()).toBeTruthy()
  let release:()=>void=()=>{}
  let fail=true
  let waiting=false
  await page.route('**/api/workspace/ai/score',async route=>{
    await new Promise<void>(resolve=>{release=resolve; waiting=true})
    await route.fulfill(fail?{status:502,json:{error:'模型请求超时，请重试。'}}:{json:{rows:Array.from({length:6},()=>({score:80,answerId:1,quote:state.questions[0].transcript,tip:'补充实验指标。'}))}})
  })
  await page.goto('/workspace')
  await page.getByRole('button',{name:'生成整场报告',exact:true}).click()
  await expect(page.getByRole('button',{name:'正在生成报告…',exact:true})).toBeDisabled()
  await expect(page.getByRole('status').filter({hasText:'正在一次分析六个维度'})).toBeVisible()
  await expect.poll(()=>waiting).toBeTruthy()
  waiting=false
  release()
  await expect(page.getByRole('alert')).toContainText('模型请求超时')
  fail=false
  await page.getByRole('button',{name:'生成整场报告',exact:true}).click()
  await expect(page.getByRole('button',{name:'正在生成报告…',exact:true})).toBeDisabled()
  await expect.poll(()=>waiting).toBeTruthy()
  waiting=false
  release()
  await expect(page.getByRole('heading',{name:'整场面试报告'})).toBeVisible()
  await expect(page.getByText('80.00',{exact:true})).toBeVisible()
})

test('追问归属原题编号，连续追问和刷新后编号稳定', async ({page,request}) => {
  const {version}=await(await request.get('/api/workspace')).json()
  const state={page:'练习',stage:'练习',tab:'手动输入',questions:[{id:1,text:'原题一',source:'手动输入',transcript:'原题回答'},{id:2,text:'原题二',source:'手动输入',transcript:'第二题回答'}],active:0,jd:'',link:'',raw:'',screenshots:[],resumes:[profile],practiceProfile:profile,resumeIndex:-1,selectedResume:0,originalAudio:'',originalName:'',segments:[],confirmed:false,report:[],reportKind:'练习',reports:[],questionId:2,stale:false,evidence:0,missing:null,skipped:[]}
  expect((await request.put('/api/workspace',{data:{version,state}})).ok()).toBeTruthy()
  await page.route('**/api/workspace/ai/followup',r=>r.fulfill({json:{question:'进一步解释你的判断。'}}))
  await page.goto('/workspace')
  await page.getByRole('button',{name:'生成一道追问',exact:true}).click()
  await expect(page.getByText('追问1-1 · 第 2 / 3 题', {exact:false})).toBeVisible()
  await page.getByLabel('本题答案').fill('追问一的回答')
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/workspace')&&r.request().method()==='PUT'&&r.request().postDataJSON().state.questions.length===4)
  await page.getByRole('button',{name:'生成一道追问',exact:true}).click()
  await expect(page.getByText('追问1-2 · 第 3 / 4 题',{exact:false})).toBeVisible()
  expect((await saved).ok()).toBeTruthy()
  await expect(page.locator('#save-status')).toHaveText('练习内容已保存')
  await page.reload()
  await expect(page.getByText('追问1-2 · 第 3 / 4 题',{exact:false})).toBeVisible()
  await page.getByRole('tab',{name:'本场题单',exact:true}).click()
  await page.getByRole('button',{name:'第 2 题 · 原题二',exact:true}).click()
  await page.getByRole('button',{name:'生成一道追问',exact:true}).click()
  await expect(page.getByText('追问2-1 · 第 5 / 5 题',{exact:false})).toBeVisible()
})

test('报告可以后台生成并查看结果，完整作答支持校对',async({page,request})=>{
  const {version}=await(await request.get('/api/workspace')).json()
  const state={page:'练习',stage:'覆盖',tab:'手动输入',questions:[{id:1,text:'介绍项目',source:'手动输入',transcript:'我的原答'}],active:0,jd:'',link:'',raw:'',screenshots:[],resumes:[profile],practiceProfile:profile,resumeIndex:-1,selectedResume:0,originalAudio:'',originalName:'',segments:[],confirmed:false,report:[],reportKind:'练习',reports:[],questionId:1,stale:false,evidence:0,missing:[],skipped:[]}
  await request.put('/api/workspace',{data:{version,state}})
  let release:()=>void=()=>{}
  await page.route('**/api/workspace/ai/score',async route=>{
    await new Promise<void>(r=>release=r)
    await route.fulfill({json:{rows:Array.from({length:6},()=>({score:80,answerId:1,quote:'我的原答',tip:'补充证据'}))}})
  })
  await page.goto('/workspace')
  await page.getByRole('button',{name:'生成整场报告',exact:true}).click()
  await page.getByRole('button',{name:'简历库',exact:true}).click()
  await expect(page.getByRole('heading',{name:'简历资料库',exact:true})).toBeVisible()
  release()
  await page.getByRole('button',{name:'查看报告',exact:true}).click()
  await page.getByRole('button',{name:'查看全部回答原文',exact:true}).click()
  await expect(page.getByText('我的原答',{exact:true})).toBeVisible()
  await expect(page.locator('textarea')).toHaveCount(0)
  await page.getByRole('button',{name:'回到这题作答修改',exact:true}).click()
  await page.getByLabel('本题答案',{exact:true}).fill('校对后答案')
  await page.getByRole('button',{name:/报告$/}).first().click()
  await expect(page.getByText('作答已更新 · 等待手动重评')).toBeVisible()
})

test('保存失败提供重试，多窗口冲突可下载本地草稿',async({page})=>{
  let conflict=false
  await page.route('**/api/workspace',async route=>{
    if(route.request().method()==='PUT') await route.fulfill({status:conflict?409:503,json:{error:conflict?'其他窗口已更新工作台':'保存失败'}})
    else await route.continue()
  })
  await page.goto('/workspace')
  await page.getByRole('button',{name:'模型设置',exact:true}).click()
  await expect(page.locator('#save-status')).toHaveText('练习内容保存失败，请重试')
  conflict=true
  await page.getByRole('button',{name:'重试保存',exact:true}).click()
  await expect(page.locator('#save-status')).toContainText('其他窗口已更新')
  const download=page.waitForEvent('download')
  await page.getByRole('button',{name:'下载本地草稿',exact:true}).click()
  expect((await download).suggestedFilename()).toBe('好好面-本地草稿.json')
})

test('练习页直接提供重答辅导和参考答案，采用并替换当前答案仍由用户完成',async({page,request})=>{
  const {version}=await(await request.get('/api/workspace')).json()
  const state={page:'练习',stage:'练习',tab:'手动输入',questions:[{id:1,text:'如何确定产品优先级？',source:'手动输入',transcript:'我比较使用频率。'}],active:0,jd:'',link:'',raw:'',screenshots:[],resumes:[profile],practiceProfile:profile,resumeIndex:-1,selectedResume:0,originalAudio:'',originalName:'',segments:[],confirmed:false,report:[],reportKind:'练习',reports:[],questionId:1,stale:false,evidence:0,missing:null,skipped:[]}
  await request.put('/api/workspace',{data:{version,state}})
  await page.route('**/api/workspace/ai/reference',async route=>{
    expect(route.request().postDataJSON().input).toMatchObject({role:'产品经理',question:'如何确定产品优先级？'})
    await route.fulfill({json:{answer:'1. 明确目标\n2. 比较用户价值与成本\n3. 验证和迭代'}})
  })
  await page.route('**/api/workspace/ai/coach',route=>route.fulfill({json:{guidance:'补充取舍和验证指标。'}}))
  await page.goto('/workspace')
  await page.getByRole('tab',{name:'重答辅导',exact:true}).click()
  await expect(page.getByRole('heading',{name:'需要帮助？',exact:true})).toBeVisible()
  await expect(page.getByText('本场资料：产品经理简历 · 目标岗位：产品经理',{exact:true})).toBeVisible()
  await page.getByText('查看参考答案（AI 辅助）',{exact:true}).click()
  await page.getByRole('button',{name:'生成参考答案',exact:true}).click()
  await expect(page.getByText('1. 明确目标',{exact:false})).toBeVisible()
  await expect(page.getByLabel('本题答案')).toHaveValue('我比较使用频率。')
  await page.getByText('获取改进思路',{exact:true}).click()
  await page.getByLabel('希望改进的地方').fill('没有说明验证方法')
  await page.getByRole('button',{name:'生成重答框架',exact:true}).click()
  await expect(page.getByText('补充取舍和验证指标。')).toBeVisible()
  await page.getByLabel('重答草稿（尚未采用）').fill('我比较价值和成本，并验证结果。')
  await page.getByRole('button',{name:'保存为当前答案',exact:true}).click()
  await expect(page.getByLabel('本题答案')).toHaveValue('我比较价值和成本，并验证结果。')
  await expect(page.locator('#save-status')).toHaveText('练习内容已保存')
  await page.reload()
  await page.getByText('查看参考答案（AI 辅助）',{exact:true}).click()
  await expect(page.getByText('1. 明确目标',{exact:false})).toBeVisible()
})

test('先确认目标再导入，资料修改不会改变本场快照',async({page,request})=>{
  const {version}=await(await request.get('/api/workspace')).json()
  await request.put('/api/workspace',{data:{version,state:{page:'练习',stage:'导入',tab:'手动输入',questions:[],active:0,jd:'',link:'',raw:'',screenshots:[],resumes:[],resumeIndex:-1,selectedResume:-1,originalAudio:'',originalName:'',segments:[],confirmed:false,report:[],reportKind:'练习',reports:[],questionId:0,stale:false,evidence:0,missing:null,skipped:[]}}})
  await page.goto('/workspace')
  await expect(page.getByRole('heading',{name:'确认本场练习目标',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'生成题单',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'创建简历和目标岗位',exact:true}).click()
  await page.getByLabel('简历名称（必填）', {exact:true}).fill('我的产品简历')
  await page.getByLabel('目标岗位（必填）',{exact:true}).fill('产品经理')
  await page.getByLabel('简历正文（必填，可编辑）',{exact:true}).fill('负责调研与需求优先级排序。')
  await page.getByRole('button',{name:'完成',exact:true}).click()
  await page.getByRole('button',{name:'确认目标，导入材料',exact:true}).click()
  await page.getByLabel('已有面试题').fill('如何确定产品优先级？')
  await page.getByRole('button',{name:'使用这些题目',exact:true}).click()
  await page.getByRole('button',{name:'确认并开始练习',exact:true}).click()
  await page.getByRole('tab',{name:'重答辅导',exact:true}).click()
  await expect(page.getByText('本场资料：我的产品简历 · 目标岗位：产品经理',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'简历库',exact:true}).click()
  await page.getByRole('button',{name:'编辑',exact:true}).click()
  await page.getByLabel('目标岗位（必填）',{exact:true}).fill('运营经理')
  await page.getByRole('button',{name:'完成',exact:true}).click()
  await page.getByRole('button',{name:'模拟面试',exact:true}).click()
  await expect(page.getByText('本场资料：我的产品简历 · 目标岗位：产品经理',{exact:true})).toBeVisible()
  await expect(page.locator('#save-status')).toHaveText('练习内容已保存')
  const saved=await(await request.get('/api/workspace')).json()
  expect(saved.state.practiceProfile.role).toBe('产品经理')
  expect(saved.state.resumes[0].role).toBe('运营经理')
})

test('历史报告恢复其绑定的简历岗位快照',async({page,request})=>{
  const {state,version}=await(await request.get('/api/workspace')).json()
  const oldProfile={...profile,role:'后端工程师',text:'旧版技术经历'}
  const question={id:50,text:'介绍系统设计',source:'手动输入',transcript:'按服务边界拆分系统。'}
  const rows=Array.from({length:6},()=>({score:80,question,label:'已有作答证据',tip:'补充验证方法。'}))
  await request.put('/api/workspace',{data:{version,state:{...state,page:'练习',stage:'导入',practiceProfile:undefined,archives:[{title:'技术面',createdAt:'2026-11-18T01:00:00Z',questions:[question],report:rows,stale:false,jd:'系统设计',skipped:[],profile:oldProfile}]}}})
  await page.goto('/workspace')
  await page.getByRole('button',{name:'面试记录',exact:true}).click()
  await page.getByRole('button',{name:'打开报告',exact:true}).click()
  await expect(page.getByRole('heading',{name:'整场面试报告',exact:true})).toBeVisible()
  await expect(page.getByText('本场资料：产品经理简历 · 目标岗位：后端工程师',{exact:true}).first()).toBeVisible()
  await expect(page.locator('#save-status')).toHaveText('练习内容已保存')
  await page.reload()
  await expect(page.getByText('本场资料：产品经理简历 · 目标岗位：后端工程师',{exact:true}).first()).toBeVisible()
})

test('横排工具Tab暂存逐题重答，参考答案后可直接重答',async({page,request})=>{
  const {state,version}=await(await request.get('/api/workspace')).json()
  const questions=[{id:1,text:'原题一',source:'手动输入',transcript:'旧答案',reference:'参考框架'},{id:2,text:'原题二',source:'手动输入',transcript:'另一题'}]
  await request.put('/api/workspace',{data:{version,state:{...state,page:'练习',stage:'练习',active:0,questions,toolTab:'主动追问',report:[],practiceProfile:profile,goalConfirmed:true}}})
  await page.goto('/workspace')
  await expect(page.getByRole('tab',{name:'主动追问',exact:true})).toHaveAttribute('aria-selected','true')
  await page.getByRole('tab',{name:'重答辅导',exact:true}).click()
  await page.getByText('查看参考答案（AI 辅助）',{exact:true}).click()
  await expect(page.getByText('参考框架',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'重新回答',exact:true}).click()
  await page.getByLabel('重答草稿（尚未采用）',{exact:true}).fill('尚未采用的新版一')
  await page.getByText('获取改进思路',{exact:true}).click()
  await page.getByLabel('希望改进的地方').fill('需要补充验证')
  await page.getByRole('button',{name:'下一题',exact:true}).click()
  await page.getByRole('button',{name:'重新回答',exact:true}).click()
  await page.getByLabel('重答草稿（尚未采用）',{exact:true}).fill('第二题草稿')
  await page.getByRole('button',{name:'上一题',exact:true}).click()
  await expect(page.getByLabel('重答草稿（尚未采用）',{exact:true})).toHaveValue('尚未采用的新版一')
  await expect(page.getByLabel('希望改进的地方')).toHaveValue('需要补充验证')
  await expect(page.locator('#save-status')).toHaveText('练习内容已保存')
  await page.reload()
  await expect(page.getByLabel('重答草稿（尚未采用）',{exact:true})).toHaveValue('尚未采用的新版一')
  await page.getByText('查看当前认可的答案',{exact:true}).click()
  await expect(page.getByText('旧答案',{exact:true})).toBeVisible()
})

test('报告任务刷新恢复，并自动出现在练习记录',async({page,request})=>{
  const {state,version}=await(await request.get('/api/workspace')).json()
  const questions=[{id:1,text:'介绍项目',source:'手动输入',transcript:'实际作答'}]
  await request.put('/api/workspace',{data:{version,state:{...state,page:'练习',stage:'覆盖',active:0,questions,practiceProfile:profile,report:[],missing:[],skipped:[],pendingReport:undefined,startedAt:new Date().toISOString(),archives:[]}}})
  let jobId=''
  let calls=0
  await page.route('**/api/workspace/ai/score',async route=>{
    calls++
    const input=route.request().postDataJSON()
    jobId ||= input.jobId
    expect(input.jobId).toBe(jobId)
    await route.fulfill({status:202,json:{jobId,status:'running'}})
  })
  let completed=false
  await page.route('**/api/workspace/report-jobs/*',route=>route.fulfill({json:completed?{status:'succeeded',rows:Array.from({length:6},()=>({score:80,answerId:1,quote:'实际作答',tip:'继续验证'}))}:{status:'running'}}))
  await page.goto('/workspace')
  await page.getByRole('button',{name:'生成整场报告',exact:true}).click()
  await expect.poll(()=>jobId.length).toBeGreaterThan(0)
  await expect(page.locator('#save-status')).toHaveText('练习内容已保存')
  await page.reload()
  completed=true
  await expect(page.getByRole('heading',{name:'整场面试报告',exact:true})).toBeVisible()
  expect(calls).toBeGreaterThan(1)
  await page.getByRole('button',{name:'面试记录',exact:true}).click()
  await expect(page.getByRole('button',{name:'打开报告',exact:true})).toHaveCount(1)
  await page.getByLabel('筛选简历与岗位').selectOption(profile.id+'::'+profile.role)
  await page.getByRole('button',{name:'打开报告',exact:true}).click()
  await expect(page.getByRole('heading',{name:'整场面试报告',exact:true})).toBeVisible()
})

test('模型连接测试先保存新密钥，并就近显示等待、失败和重试成功', async ({page,request}) => {
  const {state,version}=await(await request.get('/api/workspace')).json()
  await request.put('/api/workspace',{data:{version,state:{...state,page:'模型设置',pendingReport:undefined}}})
  const calls:string[]=[]
  await page.route('**/api/workspace/settings/dialogue',async route=>{
    expect(route.request().postDataJSON().key).toBe('test-new-key')
    calls.push('save')
    await route.fulfill({json:{ok:true}})
  })
  let release:()=>void=()=>{}
  let received=false
  let retry=false
  await page.route('**/api/workspace/test-model',async route=>{
    calls.push('test')
    received=true
    if(!retry) await new Promise<void>(resolve=>{release=resolve})
    await route.fulfill(retry?{json:{ok:true}}:{status:502,json:{error:'Kimi 认证失败（401）。请核对 API Key。'}})
  })
  await page.goto('/workspace')
  await page.locator('#dialogue-key').fill('test-new-key')
  await page.getByRole('button',{name:'保存并测试对话与图片',exact:true}).click()
  await expect.poll(()=>received).toBe(true)
  await expect(page.getByRole('button',{name:'正在测试…',exact:true})).toBeDisabled()
  await expect(page.locator('#model-test-result')).toContainText('正在测试对话与图片服务')
  expect(calls).toEqual(['save','test'])
  release()
  await expect(page.locator('#model-test-result')).toContainText('测试失败：Kimi 认证失败（401）')
  retry=true
  await page.locator('#dialogue-key').fill('test-new-key')
  await page.getByRole('button',{name:'保存并测试对话与图片',exact:true}).click()
  await expect(page.locator('#model-test-result')).toContainText('测试成功：对话与图片服务均可用。')
  await expect(page.getByRole('button',{name:'保存并测试对话与图片',exact:true})).toBeEnabled()
})

async function setWorkspace(request: APIRequestContext, patch: Record<string,unknown>) {
  const {state,version}=await(await request.get('/api/workspace')).json()
  await request.put('/api/workspace',{data:{version,state:{...state,favorites:[],active:0,practiceSessionId:'',practiceCreatedAt:'',practiceName:'',concern:'',guidance:'',draft:'',draftAudio:'',startedAt:'',questionsConfirmed:false,goalReview:false,reportSnapshot:undefined,report:[],pendingReport:undefined,archives:[],recordingArchives:[],practiceProfile:profile,resumes:[profile],selectedResume:0,goalConfirmed:true,reportKind:'练习',...patch}}})
}

test('录音复盘改选岗位后评估使用新岗位，报告自动进入统一记录',async({page,request})=>{
  const other={id:'other',name:'研发简历',role:'后端工程师',text:'开发接口'}
  await setWorkspace(request,{page:'录音复盘',reportKind:'录音',confirmed:false,resumes:[profile,other],segments:[{time:0,role:'面试官',text:'介绍项目'},{time:3,role:'候选人',text:'开发服务接口。'}]})
  await page.route('**/api/workspace/ai/*',async route=>{
    const {input}=route.request().postDataJSON()
    expect(input.role).toBe('后端工程师')
    await route.fulfill({json:route.request().url().endsWith('/coverage')?{missing:[]}:{rows:Array.from({length:6},()=>({score:80,answerId:-2,quote:'开发服务接口。',tip:'补充验证'}))}})
  })
  await page.goto('/workspace')
  await page.getByLabel('本场简历与目标岗位（必选）').selectOption('1')
  await page.getByRole('button',{name:'确认文字稿，检查评分维度',exact:true}).click()
  await page.getByRole('button',{name:'生成整场报告',exact:true}).click()
  await expect(page.getByRole('heading',{name:'整场面试报告',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'面试记录',exact:true}).click()
  await page.getByLabel('筛选简历与岗位').selectOption('other::后端工程师')
  await page.getByRole('button',{name:'打开录音报告',exact:true}).click()
  await expect(page.getByText('本场资料：研发简历 · 目标岗位：后端工程师',{exact:true})).toBeVisible()
  await expect(page.locator('#save-status')).toHaveText('练习内容已保存')
  await page.reload()
  await expect(page.getByRole('heading',{name:'整场面试报告',exact:true})).toBeVisible()
})

test('题目超限不截断，错误就近显示并聚焦，已有题目不调用AI',async({page,request})=>{
  await setWorkspace(request,{page:'练习',stage:'导入',tab:'手动输入',manualMode:'已有题目',raw:'',questions:[]})
  let aiCalls=0
  await page.route('**/api/workspace/ai/*',r=>{aiCalls++;return r.abort()})
  await page.goto('/workspace')
  const raw=page.getByLabel('已有面试题')
  const many=Array.from({length:31},(_,i)=>'问题'+i).join('\n')
  await raw.fill(many)
  await page.getByRole('button',{name:'使用这些题目',exact:true}).click()
  await expect(raw).toBeFocused()
  await expect(raw).toHaveAttribute('aria-invalid','true')
  await expect(raw).toHaveValue(many)
  await expect(page.locator('#raw-error')).toContainText('当前有 31 道')
  await raw.fill('问'.repeat(501))
  await page.getByRole('button',{name:'使用这些题目',exact:true}).click()
  await expect(page.locator('#raw-error')).toContainText('超过 500 字')
  await expect(raw).toHaveValue('问'.repeat(501))
  await raw.fill('请介绍项目？')
  await page.getByRole('button',{name:'使用这些题目',exact:true}).click()
  await expect(page.getByRole('heading',{name:'核对题目与顺序',exact:true})).toBeVisible()
  expect(aiCalls).toBe(0)
  await page.getByRole('button',{name:'更换简历与岗位',exact:true}).click()
  await expect(page.getByRole('heading',{name:'确认本场练习目标',exact:true})).toBeVisible()
})

test('截图可预览移除撤销，题目删除也可以撤销',async({page,request})=>{
  const shot={name:'面经.png',url:'/api/workspace/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}
  await setWorkspace(request,{page:'练习',stage:'导入',tab:'截图',screenshots:[shot],questions:[{id:1,text:'原题',source:'截图',transcript:''}]})
  await page.goto('/workspace')
  await expect(page.getByRole('link',{name:'预览截图 1'})).toHaveAttribute('href',shot.url)
  await page.getByRole('button',{name:'移除',exact:true}).click()
  await expect(page.getByRole('link',{name:'预览截图 1'})).toHaveCount(0)
  await page.getByRole('button',{name:'撤销',exact:true}).click()
  await expect(page.getByRole('link',{name:'预览截图 1'})).toBeVisible()
  await page.getByRole('button',{name:'手动输入',exact:true}).click()
  await page.getByLabel('输入内容类型').selectOption('已有题目')
  await page.getByLabel('已有面试题').fill('原题')
  await page.getByRole('button',{name:'使用这些题目',exact:true}).click()
  await page.getByRole('button',{name:'删除',exact:true}).click()
  await expect(page.locator('[data-question]')).toHaveCount(0)
  await page.getByRole('button',{name:'撤销',exact:true}).click()
  await expect(page.locator('[data-question]')).toHaveValue('原题')
})

test('模型表单切换保留密钥草稿，语音测试先保存当前配置，密钥不进入练习快照',async({page,request})=>{
  await setWorkspace(request,{page:'模型设置'})
  const calls:string[]=[]
  await page.route('**/api/workspace/settings/speech',async route=>{
    calls.push('save')
    const body=route.request().postDataJSON()
    expect(body).not.toHaveProperty('modelKey')
    expect(body.key).toBe('ui-speech-draft')
    await route.fulfill({json:{ok:true}})
  })
  await page.route('**/api/workspace/media?*',route=>{calls.push('upload');return route.fulfill({json:{url:'/api/workspace/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}})})
  await page.route('**/api/workspace/transcribe',route=>{calls.push('transcribe');return route.fulfill({json:{segments:[{time:0,text:'测试转写成功'}]}})})
  await page.route('**/api/workspace/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',route=>route.fulfill({json:{ok:true}}))
  await page.goto('/workspace')
  await page.locator('#provider').selectOption('kimi')
  await page.locator('#dialogue-key').fill('ui-model-draft')
  await page.locator('#speech').selectOption('paraformer-realtime-v2')
  await expect(page.locator('#dialogue-key')).toHaveValue('ui-model-draft')
  await page.locator('#speech').selectOption('asr-1.0')
  await expect(page.locator('#dialogue-key')).toHaveValue('ui-model-draft')
  await page.locator('#speech-key').fill('ui-speech-draft')
  await page.getByLabel('测试录音').setInputFiles({name:'test.wav',mimeType:'audio/wav',buffer:Buffer.from('mock-audio')})
  expect(calls).toEqual([])
  await expect(page.locator('#speech-key')).toHaveValue('ui-speech-draft')
  await page.getByRole('button',{name:'保存并测试转写',exact:true}).click()
  await expect(page.locator('#speech-test-result')).toContainText('语音转写通过：测试转写成功')
  expect(calls).toEqual(['save','upload','transcribe'])
  await expect(page.locator('#save-status')).toHaveText('练习内容已保存')
  const saved=await(await request.get('/api/workspace')).json()
  expect(JSON.stringify(saved.state)).not.toContain('ui-model-draft')
  expect(JSON.stringify(saved.state)).not.toContain('ui-speech-draft')
})

test('文字作答状态即时更新，示例替换可取消，手机按钮触控尺寸统一',async({page,request})=>{
  await setWorkspace(request,{page:'练习',stage:'导入',tab:'手动输入',manualMode:'已有题目',raw:'我的原题'})
  await page.setViewportSize({width:390,height:844})
  await page.goto('/workspace')
  page.once('dialog',dialog=>dialog.dismiss())
  await page.getByRole('button',{name:'试用示例',exact:true}).click()
  await expect(page.getByLabel('已有面试题')).toHaveValue('我的原题')
  const tooSmall=await page.locator('button').evaluateAll(buttons=>buttons.filter(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.height>0&&r.height<44}).map(b=>b.textContent))
  expect(tooSmall).toEqual([])
  await page.getByRole('button',{name:'使用这些题目',exact:true}).click()
  await page.getByRole('button',{name:'确认并开始练习',exact:true}).click()
  await expect(page.locator('#answer-status')).toContainText('等待作答')
  await page.getByLabel('本题答案',{exact:true}).fill('我有一个具体项目。')
  await expect(page.locator('#answer-status')).toHaveText('已填写答案')
})

test('统一记录在模拟报告与录音报告间切换，不混淆报告类型和岗位',async({page,request})=>{
  const q={id:1,text:'模拟题',source:'手动输入',transcript:'模拟答案'}
  const rows=Array.from({length:6},()=>({score:80,question:q,label:'已有作答证据',tip:'建议'}))
  const other={id:'recording-profile',name:'录音简历',role:'工程师',text:'开发经历'}
  await setWorkspace(request,{page:'练习记录',stage:'报告',reportKind:'录音',practiceProfile:other,confirmed:true,segments:[{time:0,role:'候选人',text:'录音答案'}],report:rows,
    archives:[{title:'模拟报告',createdAt:'2026-11-18T01:01:00Z',profile,questions:[q],report:rows,stale:false,jd:'模拟JD',skipped:[]}],
    recordingArchives:[{id:'record-a',createdAt:'2026-11-18T01:02:00Z',profile:other,title:'录音报告',audio:'',segments:[{time:0,role:'候选人',text:'录音答案'}],report:rows,confirmed:true}],recordingId:'record-a'})
  await page.goto('/workspace')
  await page.getByRole('button',{name:'打开报告',exact:true}).click()
  await expect(page.getByRole('button',{name:'查看全部回答原文',exact:true})).toBeVisible()
  await expect(page.getByText('本场资料：产品经理简历 · 目标岗位：产品经理',{exact:true}).first()).toBeVisible()
  await expect(page.locator('#save-status')).toHaveText('练习内容已保存')
  let saved=await(await request.get('/api/workspace')).json()
  expect(saved.state.reportKind).toBe('练习')
  await page.getByRole('button',{name:'面试记录',exact:true}).click()
  await page.getByRole('button',{name:'打开录音报告',exact:true}).click()
  await expect(page.getByText('本场资料：录音简历 · 目标岗位：工程师',{exact:true})).toBeVisible()
  await expect(page.locator('#save-status')).toHaveText('练习内容已保存')
  saved=await(await request.get('/api/workspace')).json()
  expect(saved.state.reportKind).toBe('录音')
  expect(saved.state.archives[0].profile.role).toBe('产品经理')
})

test('录音文字段落的删除与合并可撤销，重新录音先说明替换',async({page,request})=>{
  await setWorkspace(request,{page:'录音复盘',reportKind:'录音',confirmed:false,segments:[{time:0,role:'面试官',text:'问题'},{time:1,role:'候选人',text:'回答'}]})
  await page.goto('/workspace')
  await page.getByRole('button',{name:'合并到上一段',exact:true}).nth(1).click()
  await expect(page.locator('[data-segment]')).toHaveCount(1)
  await page.getByRole('button',{name:'撤销',exact:true}).click()
  await expect(page.locator('[data-segment]')).toHaveCount(2)
  await expect(page.locator('[data-segment="1"]')).toHaveValue('回答')
  await page.getByRole('button',{name:'删除段落',exact:true}).nth(1).click()
  await page.getByRole('button',{name:'撤销',exact:true}).click()
  await expect(page.locator('[data-segment="1"]')).toHaveValue('回答')
  await expect(page.locator('#save-status')).toHaveText('练习内容已保存')
  await setWorkspace(request,{page:'练习',stage:'练习',questions:[{id:1,text:'问题',source:'手动输入',transcript:'当前答案',audio:'/api/workspace/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}]})
  await page.goto('/workspace')
  const dialog=page.waitForEvent('dialog')
  const click=page.getByRole('button',{name:'重新录音',exact:true}).click()
  const confirm=await dialog
  expect(confirm.message()).toContain('替换本题当前原声')
  await confirm.dismiss(); await click
  await expect(page.getByRole('button',{name:'停止录音',exact:true})).toHaveCount(0)
  await expect(page.getByLabel('本题答案',{exact:true})).toHaveValue('当前答案')
})


test.describe('报告分析与步骤导航',()=>{

const answers=[{id:1,text:'介绍项目',transcript:'我访谈了用户，明确产品目标，并通过对照数据验证上线效果。',source:'手动输入'}]
function result(){return {answerRevision:'rev-test',summary:'有需求与验证经历，取舍细节仍需补充。',rows:dimensionIds.map(id=>({id,status:'evaluated',score:80,answerId:1,quote:answers[0].transcript,scope:'审查本场回答',reason:'已说明用户调研和结果验证，缺少具体取舍。',strengths:[{title:'调研与验证相连接',analysis:'回答包含从目标到验证的具体行动。',evidence:[{answerId:1,quote:'我访谈了用户'}],relatedAnswerIds:[1]}],shortcomings:[{title:'缺少方案取舍',analysis:'没有说明备选方案与选择标准，限制对决策深度的判断。',evidence:[],relatedAnswerIds:[1]}]}))}}
const profile={id:'new-brand-profile',name:'产品简历',role:'产品经理',text:'需求调研与产品规划。'}
async function seed(request:any,patch:Record<string,unknown>={}){
  const current=await(await request.get('/api/workspace')).json()
  await request.put('/api/workspace',{data:{version:current.version,state:{page:'练习',stage:'导入',tab:'手动输入',manualMode:'已有题目',goalConfirmed:true,practiceProfile:profile,resumes:[profile],selectedResume:0,resumeIndex:-1,questions:answers,active:0,jd:'产品规划',raw:'介绍项目',link:'',screenshots:[],segments:[],originalAudio:'',originalName:'',confirmed:false,report:[],reportKind:'练习',archives:[],recordingArchives:[],reports:[],questionId:1,stale:false,evidence:0,missing:null,skipped:[],...patch}}})
}

test('服务端核对维度、版本和原文，默认分只能来自用户确认',()=>{
  const input={answerRevision:'rev-test',answers,skipped:[5]}
  const review=validateReportReview(result(),input)
  expect(review.rows[5]).toMatchObject({score:60,status:'default',strengths:[],shortcomings:[]})
  expect(review.rows[0].strengths[0].evidence[0].quote).toBe('我访谈了用户')
  const fabricated=result();fabricated.rows[0].strengths[0].evidence[0].quote='并不存在的成果'
  expect(()=>validateReportReview(fabricated,input)).toThrow('引用无法')
  const other=result();other.answerRevision='other-revision'
  expect(()=>validateReportReview(other,input)).toThrow('版本')
  const wrongDefault=result();wrongDefault.rows[0].status='default'
  expect(()=>validateReportReview(wrongDefault,input)).toThrow('状态或分数')
  const crossSession=result();crossSession.rows[0].answerId=99
  expect(()=>validateReportReview(crossSession,input)).toThrow('引用无法')
  const wrongOrder=result();wrongOrder.rows[0].id=dimensionIds[1]
  expect(()=>validateReportReview(wrongOrder,input)).toThrow('维度顺序')
  const incomplete=result();incomplete.rows[1].status='needs_review';incomplete.rows[1].score=null as unknown as number
  expect(validateReportReview(incomplete,input).rows[1].score).toBeNull()
})

test('导航条解锁有依赖，前后切换保留答案，目标只读并可新建目标',async({page,request})=>{
  await seed(request,{questions:[],raw:'',questionsConfirmed:false})
  await page.goto('/workspace')
  const flow=page.getByRole('navigation',{name:'练习步骤导航'})
  await expect(flow.getByRole('button',{name:/作答$/})).toBeDisabled()
  await expect(flow.getByRole('button',{name:/作答$/})).toHaveAttribute('title','请先导入或生成面试题。')
  await page.getByLabel('已有面试题').fill('介绍项目')
  await page.getByRole('button',{name:'使用这些题目',exact:true}).click()
  await page.getByRole('button',{name:'确认并开始练习',exact:true}).click()
  await page.getByLabel('本题答案',{exact:true}).fill('当前认可的回答')
  await flow.getByRole('button',{name:/评分前检查$/}).click()
  await expect(page.getByRole('heading',{name:'评分前检查',exact:true})).toBeVisible()
  await flow.getByRole('button',{name:/作答$/}).click()
  await expect(page.getByLabel('本题答案',{exact:true})).toHaveValue('当前认可的回答')
  await flow.getByRole('button',{name:/目标$/}).click()
  await expect(page.getByRole('heading',{name:'本场简历与目标岗位',exact:true})).toBeVisible()
  page.once('dialog',dialog=>dialog.accept())
  await page.getByRole('button',{name:'更换目标并新建练习',exact:true}).click()
  await expect(page.getByRole('heading',{name:'确认本场练习目标',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'面试记录',exact:true}).click()
  await page.getByRole('button',{name:'继续练习',exact:true}).click()
  await expect(page.getByLabel('本题答案',{exact:true})).toHaveValue('当前认可的回答')
})

test('新报告复用六维分析，原文只读，修改回作答且旧报告快照不变',async({page,request})=>{
  await seed(request,{stage:'覆盖',missing:[],questionsConfirmed:true,startedAt:'2026-11-18T08:00:00Z'})
  let calls=0
  await page.route('**/api/workspace/ai/score',async route=>{
    calls++
    const input=route.request().postDataJSON().input
    const data=result();data.answerRevision=input.answerRevision
    await route.fulfill({json:{schemaVersion:1,...data}})
  })
  await page.goto('/workspace')
  await page.getByRole('button',{name:'生成整场报告',exact:true}).click()
  await expect(page.getByText('80.00',{exact:true})).toBeVisible()
  await expect(page.getByText('调研与验证相连接',{exact:false})).toBeVisible()
  await expect(page.getByRole('tab',{name:'重答辅导',exact:true})).toHaveCount(0)
  await expect(page.locator('textarea')).toHaveCount(0)
  await page.getByRole('tab',{name:'评分细则',exact:true}).click()
  await expect(page.getByText('这个维度考察什么',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:/专业能力/}).click()
  await page.getByRole('tab',{name:'回答分析',exact:true}).click()
  expect(calls).toBe(1)
  await page.getByRole('button',{name:'查看完整回答',exact:true}).first().click()
  await expect(page.getByRole('dialog',{name:'回答原文'})).toContainText(answers[0].transcript)
  await page.getByRole('button',{name:'回到这题作答修改',exact:true}).click()
  await page.getByLabel('本题答案',{exact:true}).fill('修改后的回答')
  await page.getByRole('navigation',{name:'练习步骤导航'}).getByRole('button',{name:/报告$/}).click()
  await expect(page.getByText('作答已更新 · 等待手动重评',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'查看完整回答',exact:true}).first().click()
  await expect(page.getByRole('dialog',{name:'回答原文'})).toContainText(answers[0].transcript)
  await expect(page.getByRole('dialog',{name:'回答原文'})).not.toContainText('修改后的回答')
  await page.getByRole('button',{name:'关闭原文',exact:true}).click()
  await expect(page.locator('#save-status')).toHaveText('练习内容已保存')
  await page.reload()
  await expect(page.getByText('作答已更新 · 等待手动重评',{exact:true})).toBeVisible()
  expect(calls).toBe(1)
})

test('品牌图在工作台、旧入口和账户页加载，旧无依据零分显示待核查',async({page,request})=>{
  await seed(request,{stage:'报告',report:Array.from({length:6},()=>({score:0,label:'未返回可核对引文'})),questionsConfirmed:true})
  await page.goto('/workspace')
  await expect(page).toHaveTitle(/好好面/)
  await expect(page.getByAltText('好好面，好好准备，好好面试')).toBeVisible()
  await expect(page.getByText('报告待核查',{exact:true})).toBeVisible()
  await expect(page.getByText('0 分',{exact:true})).toHaveCount(0)
  for(const path of ['/','/account']){
    await page.goto(path)
    await expect(page).toHaveTitle(/好好面/)
    await expect(page.getByAltText('好好面，好好准备，好好面试')).toBeVisible()
  }
  const image=await request.get('/brand/haohaomian.png')
  expect(image.status()).toBe(200)
  expect((await image.body()).length).toBeGreaterThan(50000)
})
})

test('专项：切换历史练习保存当前会话草稿、材料和题目位置',async({page,request})=>{
  const current={id:71,text:'当前第二题',source:'手动输入',transcript:'当前认可答案',coachingDraft:{concern:'表达',guidance:'先结论',draft:'未采用草稿',audio:'',editing:true}}
  await setWorkspace(request,{page:'练习',stage:'练习',practiceSessionId:'current-session',practiceCreatedAt:'2026-11-18T10:00:00Z',startedAt:'2026-11-18T10:00:00Z',questionsConfirmed:true,active:1,raw:'当前材料',questions:[{id:70,text:'当前第一题',source:'手动输入',transcript:''},current],archives:[{sessionId:'history-session',title:'历史练习',createdAt:'2026-11-17T10:00:00Z',profile,questions:[{id:80,text:'历史题',source:'手动输入',transcript:'历史答案'}],report:[],stale:false,jd:'',skipped:[],draftStage:'练习',questionsConfirmed:true,goalConfirmed:true,active:0}]})
  await page.goto('/workspace')
  await expect(page.locator('#draft')).toHaveValue('未采用草稿')
  await page.getByRole('button',{name:'面试记录',exact:true}).click()
  await page.locator('[data-action="archive-history-session"]').click()
  await expect(page.getByLabel('本题答案',{exact:true})).toHaveValue('历史答案')
  await page.getByRole('button',{name:'面试记录',exact:true}).click()
  await page.locator('[data-action="archive-current-session"]').click()
  await expect(page.locator('#draft')).toHaveValue('未采用草稿')
  await expect(page.getByRole('heading',{name:'当前第二题',exact:true})).toBeVisible()
  await expect(page.locator('#save-status')).toHaveText('练习内容已保存')
  await page.reload()
  await expect(page.locator('#draft')).toHaveValue('未采用草稿')
  const state=(await(await request.get('/api/workspace')).json()).state
  expect(state.archives.find((x:any)=>x.sessionId==='current-session').raw).toBe('当前材料')
  expect(state.archives).toHaveLength(2)
})

test('专项：空题阻止跨步，继续作答保留当前题号，完成标记要求全答',async({page,request})=>{
  await setWorkspace(request,{page:'练习',stage:'确认',practiceSessionId:'validation',startedAt:'2026-11-18T10:00:00Z',questionsConfirmed:true,active:1,questions:[{id:1,text:'已答题',source:'手动输入',transcript:'答案'},{id:2,text:'',source:'手动输入',transcript:''}]})
  await page.goto('/workspace')
  const flow=page.getByRole('navigation',{name:'练习步骤导航'})
  await expect(flow.getByRole('button',{name:/作答$/})).toBeDisabled()
  await expect(page.locator('.flow-condition')).toContainText('第 2 题')
  expect(await flow.getByRole('button',{name:/作答$/}).textContent()).not.toContain('✓')
  await page.locator('[data-question="1"]').fill('第二题')
  await page.getByRole('button',{name:'保存并继续作答',exact:true}).click()
  await expect(page.getByRole('heading',{name:'第二题',exact:true})).toBeVisible()
})

test('专项：两项配置独立保存，语音无需对话模型 ID，未存配置持续提醒',async({page,request})=>{
  await request.put('/api/workspace/settings',{data:{provider:'kimi',region:'cn',model:'kimi-k3.1-pro',speech:'asr-1.0',shared:false,modelKey:'dialogue-test',speechKey:'speech-test'}})
  await setWorkspace(request,{page:'模型设置'})
  await page.goto('/workspace')
  await page.locator('#dialogue').fill('')
  await page.locator('#speech-key').fill('independent-speech-test')
  await expect(page.locator('#config-unsaved')).toContainText('未保存')
  await page.getByRole('button',{name:'保存语音配置',exact:true}).click()
  await expect(page.locator('#speech-save-status')).toContainText('已保存')
  await expect(page.locator('#dialogue')).toHaveValue('')
  await expect(page.locator('#dialogue-save-status')).toContainText('未保存')
  const settings=(await(await request.get('/api/workspace')).json()).settings
  expect(settings.model).toBe('kimi-k3.1-pro')
  expect(settings.speechConfigured).toBe(true)
  expect(JSON.stringify(settings)).not.toContain('independent-speech-test')
})

test('专项：成功转写先核对，重转保留认可答案，未确认不进入评分',async({page,request})=>{
  await setWorkspace(request,{page:'练习',stage:'练习',practiceSessionId:'asr-review',questionsConfirmed:true,questions:[{id:1,text:'介绍项目',source:'手动输入',transcript:'认可答案',audio:'/api/workspace/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}]})
  await page.route('**/api/workspace/transcribe',route=>route.fulfill({json:{segments:[{time:0,role:'候选人',text:'需要核对的机器文字'}]}}))
  await page.goto('/workspace')
  await page.getByRole('button',{name:'重新转写现有录音',exact:true}).click()
  await expect(page.getByLabel('本题答案（机器转写，待核对）',{exact:true})).toHaveValue('需要核对的机器文字')
  await expect(page.getByRole('navigation',{name:'练习步骤导航'}).getByRole('button',{name:/评分前检查$/})).toBeDisabled()
  await page.getByRole('button',{name:'放弃本次转写',exact:true}).click()
  await expect(page.getByLabel('本题答案',{exact:true})).toHaveValue('认可答案')
  await page.getByRole('button',{name:'重新转写现有录音',exact:true}).click()
  await page.getByRole('button',{name:'保存本题',exact:true}).click()
  await expect(page.getByLabel('本题答案',{exact:true})).toHaveValue('需要核对的机器文字')
})

test('专项：参考答案生成不锁住主编辑器，失败就近保留重试入口',async({page,request})=>{
  await setWorkspace(request,{page:'练习',stage:'练习',practiceSessionId:'help-test',questionsConfirmed:true,questions:[{id:1,text:'介绍项目',source:'手动输入',transcript:'认可答案'}]})
  let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve)
  await page.route('**/api/workspace/ai/reference',async route=>{await held;await route.fulfill({status:429,json:{error:'模型服务暂时繁忙（429）'}})})
  await page.goto('/workspace')
  await page.getByRole('tab',{name:'重答辅导',exact:true}).click()
  await page.getByText('查看参考答案（AI 辅助）',{exact:true}).click()
  await page.getByRole('button',{name:'生成参考答案',exact:true}).click()
  await expect(page.getByRole('button',{name:'正在生成参考答案…',exact:true})).toBeDisabled()
  await page.getByLabel('本题答案',{exact:true}).fill('生成期间仍可编辑')
  await page.getByRole('button',{name:'重新回答',exact:true}).click()
  await expect(page.locator('#draft')).toBeEditable()
  await expect(page.locator('#answer-text')).toHaveCount(0)
  await page.getByRole('button',{name:'取消重答',exact:true}).click()
  release()
  await expect(page.getByRole('alert')).toContainText('429')
  await expect(page.getByRole('button',{name:'重试此操作',exact:true})).toBeVisible()
  await expect(page.getByLabel('本题答案',{exact:true})).toHaveValue('生成期间仍可编辑')
})

test('专项：移动端超长英文简历名称不撑开页面',async({page,request})=>{
  await setWorkspace(request,{page:'简历库',resumeIndex:-1,resumes:[{...profile,name:'Resume'.repeat(70)}]})
  await page.setViewportSize({width:390,height:844})
  await page.goto('/workspace')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({path:'/tmp/haohaomian-mobile-resume.png',fullPage:true})
})

test('专项：报告弹窗 Esc 后不重开，详情 Tab 支持键盘，JD 修改标记待重评',async({page,request})=>{
  const question={id:1,text:'介绍项目',source:'手动输入',transcript:'我的项目回答'}
  const rows=Array.from({length:6},()=>({score:80,label:'已有作答证据',quote:'我的项目回答',question,tip:'补充细节'}))
  await setWorkspace(request,{page:'练习',stage:'报告',questionsConfirmed:true,questions:[question],report:rows,jd:'原JD',reportSnapshot:{jd:'原JD',role:profile.role,resume:profile.text,answers:[question],createdAt:'2026-11-18T08:00:00Z'}})
  await page.goto('/workspace')
  const analysis=page.getByRole('tab',{name:'回答分析',exact:true})
  await analysis.focus();await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab',{name:'评分细则',exact:true})).toBeFocused()
  await expect(page.locator('#report-detail-panel')).toHaveAttribute('aria-labelledby','report-tab-rubric')
  await page.keyboard.press('ArrowLeft')
  await page.getByRole('button',{name:'查看完整回答',exact:true}).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button',{name:/专业能力/}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const flow=page.getByRole('navigation',{name:'练习步骤导航'})
  await flow.getByRole('button',{name:/材料$/}).click()
  await page.getByLabel('岗位描述（JD）（选填）',{exact:true}).fill('新的岗位要求')
  await flow.getByRole('button',{name:/报告$/}).click()
  await expect(page.getByText('作答已更新 · 等待手动重评',{exact:true})).toBeVisible()
})

test('专项：麦克风可选择和本机试听，输入中断有可见提示',async({page,request})=>{
  await setWorkspace(request,{page:'练习',stage:'练习',questionsConfirmed:true,questions:[{id:1,text:'介绍项目',source:'手动输入',transcript:''}]})
  await page.addInitScript(()=>{
    const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await original(constraints);(window as any).__testStream=stream;return stream}
  })
  let calls=0
  await page.route('**/api/workspace/transcribe',route=>{calls++;return route.abort()})
  await page.goto('/workspace')
  await page.getByText('麦克风选择与试听',{exact:true}).click()
  await page.getByRole('button',{name:'获取可用麦克风',exact:true}).click()
  await expect(page.locator('#microphone-device option')).toHaveCount(4)
  const device=await page.locator('#microphone-device option').nth(1).getAttribute('value')
  await page.getByLabel('录音麦克风',{exact:true}).selectOption(device!)
  await page.getByRole('button',{name:'录制试听',exact:true}).click()
  await expect(page.getByRole('button',{name:'停止试听',exact:true})).toBeVisible()
  await page.evaluate(()=>(window as any).__testStream.getAudioTracks()[0].dispatchEvent(new Event('mute')))
  await expect(page.locator('#recording-warning')).toContainText('输入已中断')
  await page.waitForTimeout(300)
  await page.getByRole('button',{name:'停止试听',exact:true}).click()
  await expect(page.getByText('本机试听，不上传，不调用模型。',{exact:true})).toBeVisible()
  expect(await page.locator('audio').getAttribute('src')).toMatch(/^blob:/)
  expect(calls).toBe(0)
})

test('专项：语音与对话配置更新互不覆盖，解除复用保留语音凭据',async({request})=>{
  await request.put('/api/workspace/settings',{data:{provider:'minimax',region:'cn',model:'MiniMax-M3.1-Flash',speech:'asr-1.0',shared:true,modelKey:'shared-unit-key'}})
  expect((await request.patch('/api/workspace/settings/dialogue',{data:{provider:'kimi',region:'cn',model:'kimi-k3.1-pro',key:'kimi-unit-key'}})).ok()).toBe(true)
  let settings=(await(await request.get('/api/workspace')).json()).settings
  expect(settings).toMatchObject({provider:'kimi',shared:false,speechConfigured:true,modelConfigured:true,speech:'asr-1.0'})
  expect((await request.patch('/api/workspace/settings/speech',{data:{speech:'asr-1.0',region:'global',shared:false,key:'global-unit-key'}})).ok()).toBe(true)
  settings=(await(await request.get('/api/workspace')).json()).settings
  expect(settings).toMatchObject({provider:'kimi',model:'kimi-k3.1-pro',speechRegion:'global',modelConfigured:true,speechConfigured:true})
  expect((await request.patch('/api/workspace/settings/speech',{data:{speech:'asr-1.0',region:'cn',shared:true}})).status()).toBe(400)
})

test('专项：转写返回时切换历史会话，结果只写回原题',async({page,request})=>{
  await setWorkspace(request,{page:'练习',stage:'练习',practiceSessionId:'transcribing',questionsConfirmed:true,questions:[{id:1,text:'原题',source:'手动输入',transcript:'原认可答案',audio:'/api/workspace/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}],archives:[{sessionId:'other-asr-session',title:'其他练习',createdAt:'2026-11-17T10:00:00Z',profile,questions:[{id:1,text:'另一场题',source:'手动输入',transcript:'另一场答案'}],report:[],stale:false,jd:'',skipped:[],draftStage:'练习',questionsConfirmed:true,goalConfirmed:true,active:0}]})
  let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve)
  await page.route('**/api/workspace/transcribe',async route=>{await held;await route.fulfill({json:{segments:[{time:0,text:'原会话的机器转写'}]}})})
  await page.goto('/workspace')
  await page.getByRole('button',{name:'重新转写现有录音',exact:true}).click()
  await page.getByRole('button',{name:'面试记录',exact:true}).click()
  await page.locator('[data-action="archive-other-asr-session"]').click()
  release()
  await expect(page.getByLabel('本题答案',{exact:true})).toHaveValue('另一场答案')
  await expect.poll(async()=>{const state=(await(await request.get('/api/workspace')).json()).state;return state.archives.find((x:any)=>x.sessionId==='transcribing')?.questions[0].transcriptCandidate}).toBe('原会话的机器转写')
  await page.getByRole('button',{name:'面试记录',exact:true}).click()
  await page.locator('[data-action="archive-transcribing"]').click()
  await expect(page.getByLabel('本题答案（机器转写，待核对）',{exact:true})).toHaveValue('原会话的机器转写')
})

test('转写核对：确认并下一题保存认可答案，末题确认进入评分前检查',async({page,request})=>{
  await setWorkspace(request,{page:'练习',stage:'练习',questionsConfirmed:true,questions:[
    {id:1,text:'第一题',source:'手动输入',transcript:'原答案',transcriptCandidate:'机器文字一'},
    {id:2,text:'第二题',source:'手动输入',transcript:'',transcriptCandidate:'机器文字二'},
  ]})
  let aiCalls=0;await page.route('**/api/workspace/ai/*',route=>{aiCalls++;return route.abort()})
  await page.goto('/workspace')
  await expect(page.getByRole('button',{name:'下一题',exact:true})).toHaveCount(0)
  await page.getByLabel('本题答案（机器转写，待核对）',{exact:true}).fill('校对后的第一题答案')
  await page.getByRole('button',{name:'确认并下一题 →',exact:true}).click()
  await expect(page.getByRole('heading',{name:'第二题',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'确认并结束作答',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'确认并结束作答',exact:true}).click()
  await expect(page.getByRole('heading',{name:'评分前检查',exact:true})).toBeVisible()
  await expect(page.locator('#save-status')).toHaveText('练习内容已保存')
  const state=(await(await request.get('/api/workspace')).json()).state
  expect(state.questions.map((q:any)=>q.transcript)).toEqual(['校对后的第一题答案','机器文字二'])
  expect(state.questions.some((q:any)=>q.transcriptCandidate!==undefined)).toBe(false)
  expect(aiCalls).toBe(0)
})

test('转写核对：上一题暂存校对文字，刷新后可继续或放弃且原声保留',async({page,request})=>{
  const audio='/api/workspace/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  await setWorkspace(request,{page:'练习',stage:'练习',questionsConfirmed:true,active:1,questions:[
    {id:1,text:'第一题',source:'手动输入',transcript:'已答'},
    {id:2,text:'第二题',source:'手动输入',transcript:'原认可版本',transcriptCandidate:'机器文字',audio},
  ]})
  await page.goto('/workspace')
  await page.getByLabel('本题答案（机器转写，待核对）',{exact:true}).fill('尚未确认的校对稿')
  await page.getByRole('button',{name:'上一题',exact:true}).click()
  await expect(page.locator('#save-status')).toHaveText('练习内容已保存')
  await page.reload()
  await page.getByRole('button',{name:'下一题',exact:true}).click()
  await expect(page.getByLabel('本题答案（机器转写，待核对）',{exact:true})).toHaveValue('尚未确认的校对稿')
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.setViewportSize({width:1440,height:900});await page.screenshot({path:'/tmp/haoh-transcript-desktop.png',fullPage:true,animations:'disabled'})
  await page.setViewportSize({width:390,height:844})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.locator('.transcript-actions').scrollIntoViewIfNeeded()
  await page.locator('.transcript-actions').screenshot({path:'/tmp/haoh-transcript-mobile-actions.png',animations:'disabled'})
  await page.screenshot({path:'/tmp/haoh-transcript-mobile.png',animations:'disabled'})
  await expect(page.locator('.discard-transcript')).toHaveClass(/text-action/)
  await page.getByRole('button',{name:'放弃本次转写',exact:true}).click()
  await expect(page.getByLabel('本题答案',{exact:true})).toHaveValue('原认可版本')
  await expect(page.locator('audio')).toHaveAttribute('src',audio)
})

test('转写核对：空白不可确认，末题不会跳过前题尚未确认的机器文字',async({page,request})=>{
  await setWorkspace(request,{page:'练习',stage:'练习',questionsConfirmed:true,active:1,questions:[
    {id:1,text:'第一题',source:'手动输入',transcript:'',transcriptCandidate:'前题待确认'},
    {id:2,text:'第二题',source:'手动输入',transcript:'',transcriptCandidate:'末题待确认'},
  ]})
  await page.goto('/workspace')
  await page.getByLabel('本题答案（机器转写，待核对）',{exact:true}).fill('  ')
  await page.getByRole('button',{name:'保存本题',exact:true}).click()
  await expect(page.locator('#answer-text-error')).toContainText('请填写核对后的答案')
  await page.getByLabel('本题答案（机器转写，待核对）',{exact:true}).fill('末题确认内容')
  await page.getByRole('button',{name:'确认并结束作答',exact:true}).click()
  await expect(page.getByRole('heading',{name:'第一题',exact:true})).toBeVisible()
  await expect(page.getByLabel('本题答案（机器转写，待核对）',{exact:true})).toHaveValue('前题待确认')
  await expect(page.getByRole('heading',{name:'评分前检查',exact:true})).toHaveCount(0)
})

test('千问连接测试为推理和结构化输出预留额度，并保留图片输入',async()=>{
  const {runModel}=await import('../dist/workspace-ai.js')
  const original=globalThis.fetch
  const requests:any[]=[]
  globalThis.fetch=async(_url,init)=>{
    const body=JSON.parse(String(init?.body));requests.push(body)
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}],usage:{completion_tokens:41,completion_tokens_details:{reasoning_tokens:34}}}),{status:200,headers:{'content-type':'application/json'}})
  }
  try{
    expect(await runModel('dashscope','fake-test-key','qwen4-max','connection','连接测试')).toEqual({ok:true})
    expect(await runModel('dashscope','fake-test-key','qwen4-max','connection','图片测试',['data:image/png;base64,test'])).toEqual({ok:true})
    expect(requests.every(body=>body.max_tokens>=1024)).toBe(true)
    expect(requests[1].messages[1].content[1]).toMatchObject({type:'image_url'})
  }finally{globalThis.fetch=original}
})

test('切换模型服务商保留已保存及手填模型，百炼默认使用 qwen4-max',async({page,request})=>{
  await request.put('/api/workspace/settings',{data:{provider:'dashscope',model:'qwen4-max',region:'cn',speech:'asr-1.0',shared:false,modelKey:'test-provider-memory'}})
  await setWorkspace(request,{page:'模型设置'})
  await page.goto('/workspace')
  await expect(page.locator('#dialogue')).toHaveValue('qwen4-max')
  await page.locator('#provider').selectOption('kimi')
  await page.locator('#provider').selectOption('dashscope')
  await expect(page.locator('#dialogue')).toHaveValue('qwen4-max')
  await page.locator('#dialogue').fill('qwen-custom-id')
  await page.locator('#provider').selectOption('minimax')
  await page.locator('#provider').selectOption('dashscope')
  await expect(page.locator('#dialogue')).toHaveValue('qwen-custom-id')
  await page.getByRole('button',{name:'保存对话配置',exact:true}).click()
  await expect(page.locator('#dialogue-save-status')).toContainText('已保存')
  expect((await(await request.get('/api/workspace')).json()).settings.model).toBe('qwen-custom-id')
})

test('百炼免费额度限制显示准确原因，不归类为模型权限错误',async()=>{
  const {runModel}=await import('../dist/workspace-ai.js')
  const original=globalThis.fetch
  globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:'AllocationQuota.FreeTierOnly',message:'Free quota exhausted.'}}),{status:403,headers:{'content-type':'application/json'}})
  try{await expect(runModel('dashscope','fake-test-key','qwen3-vl-plus','connection','测试')).rejects.toThrow('免费额度已耗尽')}
  finally{globalThis.fetch=original}
})

test('整场报告合并覆盖判断，默认分与分析失败分开处理',()=>{
  const input={answerRevision:'auto-default-revision',defaultUncovered:true,answers:[{id:1,transcript:'我访谈了用户。'}]}
  const rows=dimensionIds.map(id=>({id,status:'default',score:60,answerId:null,quote:'',scope:'本场没有对应展示机会',reason:'未覆盖',strengths:[],shortcomings:[]}))
  rows[0]={...rows[0],status:'needs_review',score:null as unknown as number,reason:'分析无法核对'}
  const report=validateReportReview({answerRevision:input.answerRevision,summary:'按本场证据评估',rows},input)
  expect(report.rows[0]).toMatchObject({status:'needs_review',score:null})
  expect(report.rows.slice(1).every(row=>row.status==='default'&&row.score===60&&row.quote==='')).toBe(true)
  const wrong=structuredClone(rows);wrong[1].quote='我访谈了用户。';wrong[1].answerId=1 as any
  expect(()=>validateReportReview({answerRevision:input.answerRevision,rows:wrong},input)).toThrow('不能同时包含实际评分依据')
})

test('报告直接生成只请求一次评分，无补答和额外覆盖调用，重评也复用同一流程',async({page,request})=>{
  await setWorkspace(request,{page:'练习',stage:'覆盖',questionsConfirmed:true,missing:[4,5],questions:[{id:1,text:'介绍项目',source:'手动输入',transcript:'我访谈了用户。'}]})
  const calls:string[]=[]
  await page.route('**/api/workspace/ai/*',async route=>{
    const task=route.request().url().split('/').at(-1)!;calls.push(task)
    expect(task).toBe('score')
    const {input}=route.request().postDataJSON();expect(input.defaultUncovered).toBe(true);expect(input.skipped).toEqual([])
    await route.fulfill({json:{schemaVersion:1,answerRevision:input.answerRevision,summary:'本场展示有限，缺少展示机会的维度按默认计分。',rows:dimensionIds.map(id=>({id,status:'default',score:60,answerId:null,quote:'',scope:'本场没有对应展示机会',reason:'未覆盖',strengths:[],shortcomings:[]}))}})
  })
  await page.goto('/workspace')
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expect(page.getByRole('button',{name:'检查六个评分维度',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'生成整场报告',exact:true}).click()
  await expect(page.getByText('60.00',{exact:true})).toBeVisible()
  await expect(page.getByText('本场未覆盖此维度，按默认分计入',{exact:true})).toBeVisible()
  expect(calls).toEqual(['score'])
  await page.getByRole('button',{name:'返回作答修改',exact:true}).first().click()
  await page.getByLabel('本题答案',{exact:true}).fill('修改后的回答。')
  await page.getByRole('navigation',{name:'练习步骤导航'}).getByRole('button',{name:/报告$/}).click()
  await page.getByRole('button',{name:'重新评估整场',exact:true}).click()
  await expect(page.getByText('60.00',{exact:true})).toBeVisible()
  await expect.poll(()=>calls).toEqual(['score','score'])
  await expect(page.getByRole('button',{name:'正在重新评估…',exact:true})).toHaveCount(0)
})

test('千问参考答案关闭深度思考并限制输出，模型错误不会变默认报告',async()=>{
  const {runModel}=await import('../dist/workspace-ai.js');const original=globalThis.fetch
  let body:any
  globalThis.fetch=async(_url,init)=>{body=JSON.parse(String(init?.body));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({sections:Array.from({length:4},(_,i)=>({title:'要点'+i,content:'我会先说明目标和判断依据，再用真实项目说明行动、取舍与验证结果。'}))})}}]}),{status:200,headers:{'content-type':'application/json'}})}
  try{const result=await runModel('dashscope','fake-key','qwen4-max','reference',{question:'如何介绍项目？'}) as {answer:string};expect(result.answer).toContain('4. 要点3');expect(body).toMatchObject({enable_thinking:false,max_tokens:3072,response_format:{type:'json_schema'}})}
  finally{globalThis.fetch=original}
})

test('千问报告强制包含六维与版本的结构，仍经过引文和状态核查',async()=>{
  const {runModel}=await import('../dist/workspace-ai.js');const original=globalThis.fetch
  const input={answerRevision:'schema-bound-revision',defaultUncovered:true,answers:[]}
  let body:any
  const response={schemaVersion:1,answerRevision:input.answerRevision,summary:'本场缺少作答，默认分非实际评估。',rows:dimensionIds.map(id=>({id,status:'default',score:60,answerId:null,quote:'',scope:'无作答证据',reason:'本场未覆盖',strengths:[],shortcomings:[]}))}
  globalThis.fetch=async(_url,init)=>{body=JSON.parse(String(init?.body));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response)}}]}),{status:200,headers:{'content-type':'application/json'}})}
  try{
    const result=await runModel('dashscope','fake-key','qwen4-max','score',input)
    expect(body.response_format).toMatchObject({type:'json_schema',json_schema:{strict:true,schema:{required:['schemaVersion','answerRevision','summary','rows'],properties:{answerRevision:{enum:[input.answerRevision]},rows:{minItems:6,maxItems:6}}}}})
    expect(body.enable_thinking).toBe(false)
    expect(validateReportReview(result,input).rows.every(row=>row.status==='default'&&row.score===60)).toBe(true)
  }finally{globalThis.fetch=original}
})

test('参考答案输出被截断或拦截时，即使JSON合法也不能视作成功',async()=>{
  const {runModel}=await import('../dist/workspace-ai.js');const original=globalThis.fetch
  let reason='length'
  const response={sections:Array.from({length:4},(_,i)=>({title:'要点'+i,content:'我会先说明目标和判断依据，再用真实项目说明行动、取舍与验证结果。'}))}
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:reason,message:{content:JSON.stringify(response)}}]}),{status:200,headers:{'content-type':'application/json'}})
  try{
    await expect(runModel('dashscope','fake-reference-key','qwen4-max','reference',{})).rejects.toThrow('输出达到上限')
    reason='content_filter'
    await expect(runModel('dashscope','fake-reference-key','qwen4-max','reference',{})).rejects.toThrow('输出被服务商拦截')
  }finally{globalThis.fetch=original}
})

test('参考答案校验拒绝缺失要点和半句话，完整内容按编号展示并保留生成信息',async()=>{
  const {validateReferenceAnswer}=await import('../dist/reference-answer.js')
  const section={title:'说明决策依据',content:'我会先明确目标和约束，再比较备选方案，并用真实项目说明验证结果。'}
  expect(()=>validateReferenceAnswer({answer:'1. 完整第一点。\n2. 核心原则是'})).toThrow('结构不完整')
  expect(()=>validateReferenceAnswer({sections:[section,section]})).toThrow('结构不完整')
  expect(()=>validateReferenceAnswer({sections:[section,section,section,{...section,content:'我会把算法不确定性和商业承诺的冲突纳入决策，核心原则是'}]})).toThrow('未写完')
  const {runModel}=await import('../dist/workspace-ai.js');const original=globalThis.fetch
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({sections:Array.from({length:4},()=>section)})}}],usage:{completion_tokens:420}}),{status:200,headers:{'content-type':'application/json'}})
  try{
    const result=await runModel('dashscope','fake-reference-key','qwen4-max','reference',{}) as {answer:string;generation:unknown}
    expect(result.answer).toContain('4. 说明决策依据')
    expect(result.generation).toMatchObject({model:'qwen4-max',provider:'dashscope',finishReason:'stop',completionTokens:420})
    expect(JSON.stringify(result)).not.toContain('fake-reference-key')
  }finally{globalThis.fetch=original}
})

test('旧的不完整参考答案显示提醒，重新生成失败保留原回答和已有参考',async({page,request})=>{
  const partial='1. 需求优先级量化。\n\n2. 算法与商业冲突，核心原则是'
  await setWorkspace(request,{page:'练习',stage:'练习',questionsConfirmed:true,questions:[{id:1,text:'如何确定需求优先级？',source:'手动输入',transcript:'当前认可答案',reference:partial}]})
  await page.route('**/api/workspace/ai/reference',route=>route.fulfill({status:502,json:{error:'模型返回的参考答案有未写完的要点，请重新生成；原有答案保留。'}}))
  await page.goto('/workspace')
  await page.getByRole('tab',{name:'重答辅导',exact:true}).click()
  await page.getByText('查看参考答案（AI 辅助）',{exact:true}).click()
  await expect(page.getByText('当前保存的参考答案可能未写完，请重新生成。你的作答不会被替换。',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'重新生成参考答案',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('未写完的要点')
  await expect(page.locator('.reference-text')).toHaveText(partial)
  await expect(page.getByLabel('本题答案',{exact:true})).toHaveValue('当前认可答案')
})

test('收藏认可答案和AI参考答案，快照在原答案修改后保持不变且可跨刷新取消',async({page,request})=>{
  await setWorkspace(request,{page:'练习',stage:'练习',questionsConfirmed:true,practiceSessionId:'favorite-practice',questions:[{id:1,text:'请介绍一次项目取舍。',source:'手动输入',transcript:'我比较影响和成本后确定优先级。',reference:'先明确目标，再说明备选方案与验证结果。'}]})
  let calls=0;await page.route('**/api/workspace/ai/*',route=>{calls++;return route.abort()})
  await page.goto('/workspace')
  await page.getByRole('button',{name:'收藏认可答案',exact:true}).click()
  await expect(page.getByRole('button',{name:'取消收藏认可答案',exact:true})).toHaveAttribute('aria-pressed','true')
  await page.getByRole('tab',{name:'重答辅导',exact:true}).click()
  await page.getByText('查看参考答案（AI 辅助）',{exact:true}).click()
  await page.getByRole('button',{name:'收藏AI参考答案',exact:true}).click()
  await expect(page.getByRole('button',{name:'取消收藏AI参考答案',exact:true})).toBeVisible()
  await page.getByLabel('本题答案',{exact:true}).fill('这是修改后的认可答案。')
  await expect(page.getByRole('button',{name:'收藏认可答案',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'我的收藏',exact:true}).click()
  await expect(page.getByRole('heading',{name:'我的收藏',exact:true})).toBeVisible()
  await expect(page.locator('.favorite-card')).toHaveCount(2)
  await expect(page.getByText('我比较影响和成本后确定优先级。',{exact:true})).toBeVisible()
  await expect(page.getByText('这是修改后的认可答案。',{exact:true})).toHaveCount(0)
  await expect(page.getByText('自己的认可答案',{exact:true})).toBeVisible()
  await expect(page.getByText('AI参考答案',{exact:true})).toBeVisible()
  await expect(page.locator('.favorite-card').first()).toContainText('产品经理')
  await expect(page.locator('#save-status')).toHaveText('练习内容已保存')
  await page.reload()
  await expect(page.locator('.favorite-card')).toHaveCount(2)
  await page.setViewportSize({width:390,height:844})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.screenshot({path:'/tmp/haoh-favorites-mobile.png',animations:'disabled'})
  await page.locator('.favorite-card').first().screenshot({path:'/tmp/haoh-favorites-card-mobile.png',animations:'disabled'})
  await page.getByRole('button',{name:'取消收藏',exact:true}).first().click()
  await expect(page.locator('.favorite-card')).toHaveCount(1)
  const data=await(await request.get('/api/workspace')).json()
  expect(data.state.questions[0].transcript).toBe('这是修改后的认可答案。')
  expect(data.state.stale).toBe(false)
  expect(calls).toBe(0)
})

test('收藏取消和多版本快照不修改评分输入，未认可草稿不能作为认可答案收藏',async({page,request})=>{
  await setWorkspace(request,{page:'练习',stage:'练习',questionsConfirmed:true,questions:[{id:1,text:'项目经验',source:'手动输入',transcript:'认可的旧版本。',coachingDraft:{concern:'细节不足',guidance:'先结论',draft:'未采用的新草稿。',audio:'',editing:true}}]})
  await page.goto('/workspace')
  await page.getByRole('button',{name:'收藏认可答案',exact:true}).click()
  await page.getByRole('button',{name:'取消收藏认可答案',exact:true}).click()
  await expect(page.getByRole('button',{name:'收藏认可答案',exact:true})).toHaveAttribute('aria-pressed','false')
  await page.getByRole('button',{name:'收藏认可答案',exact:true}).click()
  await page.getByRole('button',{name:'保存为当前答案',exact:true}).click()
  await page.getByRole('button',{name:'收藏认可答案',exact:true}).click()
  await page.getByRole('button',{name:'我的收藏',exact:true}).click()
  await expect(page.locator('.favorite-card')).toHaveCount(2)
  await expect(page.getByText('认可的旧版本。',{exact:true})).toBeVisible()
  await expect(page.getByText('未采用的新草稿。',{exact:true})).toBeVisible()
  await expect(page.locator('#save-status')).toHaveText('练习内容已保存')
  const state=(await(await request.get('/api/workspace')).json()).state
  expect(state.favorites.map((entry:any)=>entry.answer).sort()).toEqual(['未采用的新草稿。','认可的旧版本。'].sort())
  expect(state.questions[0].transcript).toBe('未采用的新草稿。')
})

test('从报告收藏回答快照不改变已有报告、总分或过期状态',async({page,request})=>{
  const q={id:1,text:'介绍项目',source:'手动输入',transcript:'报告使用的完整认可答案。'}
  const rows=Array.from({length:6},()=>({score:80,status:'evaluated',label:'已有作答证据',question:q,quote:q.transcript}))
  await setWorkspace(request,{page:'练习',stage:'报告',questionsConfirmed:true,jd:'',questions:[q],report:rows,stale:false,reportSnapshot:{role:profile.role,jd:'',answers:[q],summary:'已有报告',revision:'saved-report'}})
  await page.goto('/workspace')
  await expect(page.getByText('80.00',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'查看完整回答',exact:true}).first().click()
  await page.getByRole('dialog').getByRole('button',{name:'收藏认可答案',exact:true}).click()
  await expect(page.getByRole('dialog').getByRole('button',{name:'取消收藏认可答案',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'关闭原文',exact:true}).click()
  await expect(page.locator('#save-status')).toHaveText('练习内容已保存')
  const state=(await(await request.get('/api/workspace')).json()).state
  expect(state.report).toEqual(rows)
  expect(state.stale).toBe(false)
  expect(state.favorites[0]).toMatchObject({source:'认可答案',answer:q.transcript,targetRole:profile.role})
  await page.reload()
  await expect(page.getByText('80.00',{exact:true})).toBeVisible()
  await expect(page.getByText('作答已更新 · 等待手动重评',{exact:true})).toHaveCount(0)
})

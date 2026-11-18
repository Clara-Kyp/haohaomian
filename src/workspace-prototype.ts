// Interview workspace with account-scoped persistence and explicit AI actions.
import { dimensions } from './shared.js'
import {hasCompleteSentenceEnd} from './reference-answer.js'
import {reviewCriteria,scoreBands,type ReviewAnalysis,type ReviewPoint,type ReviewedRow,type ReviewStatus} from './report-review.js'

type Page = '我的收藏' | '练习记录' | '练习' | '录音复盘' | '简历库' | '模型设置' | '账户与邀请'
type Stage = '导入' | '确认' | '练习' | '覆盖' | '报告'
type Question = { transcriptCandidate?:string; transcriptionError?:string;audioWarning?:string; displayLabel?:string; coachingDraft?: {concern:string;guidance:string;draft:string;audio:string;editing:boolean}; id: number; reference?: string; referenceGeneration?:{provider:string;model:string;generatedAt:string;finishReason:string;completionTokens?:number}; parentId?: number; followupNumber?: number; failed?: boolean; text: string; source: string; audio?: string; transcript: string; pending?: boolean }
type Favorite = {id:string;sessionId:string;questionId:number;source:'认可答案'|'AI参考答案';question:string;answer:string;targetRole:string;createdAt:string}
let favorites:Favorite[]=[]
type ScoreRow={score:number|null;question?:Question;label:string;tip?:string;status?:ReviewStatus;analysis?:ReviewAnalysis}
type ReportSnapshot={contextKey?:string;answers:(Question & {displayLabel?:string})[];summary:string;revision:string;role:string;jd:string}
type Resume = { id?: string; role?: string; name: string; text: string; file?: string }
type Segment = { speaker?: string; dimension?: number; time: number; role: string; text: string }
const content = document.querySelector<HTMLElement>('#content')!
const assistant = document.querySelector<HTMLElement>('#assistant')!
const nav = document.querySelector<HTMLElement>('#nav')!
const notice = document.querySelector<HTMLElement>('#notice')!
const pages: Page[] = ['练习', '练习记录', '我的收藏', '录音复盘', '简历库', '模型设置', '账户与邀请']
const sample = [
  '介绍一个你主导过的项目，你如何验证最终结果？',
  '团队对方案有分歧时，你如何做出取舍并推动落地？',
  '讲一次项目受阻后的复盘，你之后改变了什么？',
]
const sampleAnswers = [
  '我先和产品确认交付目标，再把问题拆成三个可验证的假设。最后用上线前后的数据验证结果。',
  '我邀请研发和设计先对齐判断标准，用小范围实验验证方案，并记录了每个选项的代价。',
  '我在复盘时发现同步节奏太慢，后来每周检查一次风险，并主动向同事收集反馈。',
]
const tips = [
  '说明你做过的工作与目标岗位的具体对应关系。',
  '补充方案的关键约束、技术取舍和验证方法。',
  '把拆解依据和验证结果分别说清楚。',
  '讲清分歧是什么，以及你本人如何推动达成决策。',
  '说出复盘后改变的一件事，以及它怎样影响结果。',
  '用一项具体决策说明你如何处理压力、失误或承诺。',
]
let page: Page = '练习'
let stage: Stage = '导入'
let goalConfirmed = false
let returnToGoal = false
let toolTab = '主动追问'
let editingAnswer = false
let coachingOwner: number | undefined
let historyFilter = ''
let pendingReport: {id:string;input:ReturnType<typeof reportInput>;kind:ReportKind;skipped:number[]} | undefined
let manualMode = '已有题目'
let tab = '手动输入'
let questions: Question[] = []
let active = 0
let jd = ''
let link = ''
let raw = ''
let screenshots: { name: string; url: string }[] = []
let resumes: Resume[] = []
let resumeIndex = -1
let selectedResume = -1
type PracticeProfile = { id: string; name: string; role: string; text: string; file?: string }
let practiceProfile: PracticeProfile | undefined
let originalAudio = ''
let originalName = ''
let segments: Segment[] = []
let confirmed = false
let report:ScoreRow[]=[]
let reportSnapshot:ReportSnapshot|undefined
let reportDetailTab='analysis'
let reportAnswerId:number|undefined
let goalReview=false
let questionsConfirmed=false
const approvedQuestionEdits=new Set<number>()
let navigating=false
type ReportKind = '练习' | '录音'
let reportKind: ReportKind = '练习'
let questionId = 0
let evidence = 0
let stale = false
let concern = ''
let guidance = ''
let draft = ''
let draftAudio = ''
let draftNeedsReview=false
let selectedMicrophone=''
let microphones:MediaDeviceInfo[]=[]
let microphonePreview=''
let microphoneSetupOpen=false
let micWarning=''
let lastSoundAt=0
let silentTicks=0
let totalAudioTicks=0
const pendingHelp=new Set<string>()
const helpErrors=new Map<string,string>()
let supplemental = new Set<number>()
let missing: number[] | null = null
let skipped = new Set<number>()
let workVersion = 0
let ready = false
let blocked = false
let working = false
let operationMessage = ''
let operationAction = ''
let lastAction = ''
let operationError = ''
let operationOrigin: Page = '练习'
let operationCompleted = false
let saveStatus = '已保存'
let savedRevision = 0
let localRevision = 0
let recordingStarted = 0
let recordingMessage = ''
let recordingTick: ReturnType<typeof setInterval>
let audioContext: AudioContext | undefined
let analyser: AnalyserNode | undefined
let targetRole = ''
let practiceName = ''
let startedAt = ''
let practiceSessionId=''
let practiceCreatedAt=''
let reviewAll = false
let selectedAnswerId: number | undefined
let reportBusy = ''
let reportError = ''
let generatingFollowup = false
let followupError = ''
let isAdmin = false
let accountEnabled = false
let saveTimer: ReturnType<typeof setTimeout>
let saveChain = Promise.resolve(false)
let recordingArchives: { id?: string; createdAt?: string; updatedAt?:string; stale?:boolean; activeResume?:number; jd?:string; profile?: PracticeProfile; reportSnapshot?:ReportSnapshot; title: string; audio: string; segments: Segment[]; report: ScoreRow[]; confirmed: boolean }[] = []
let archives: { sessionId?:string; updatedAt?:string; active?:number; startedAt?:string; raw?:string; tab?:string; manualMode?:string; link?:string; screenshots?:{name:string;url:string}[]; goalConfirmed?:boolean; questionsConfirmed?:boolean; draftStage?:Stage; reportSnapshot?:ReportSnapshot; profile?: PracticeProfile; createdAt?: string; title: string; questions: Question[]; report: ScoreRow[]; stale: boolean; jd: string; skipped: number[] }[] = []
let savedModelScope=''
let savedSpeechScope=''
let modelConfigured = false
let speechTestResult = ''
let connectionResult = ''
let connectionTesting = false
let speechTesting = false
let speechTestFile: File | undefined
const modelKeyDrafts = new Map<string,string>()
const dialogueModelDrafts = new Map<string,string>()
const speechKeyDrafts = new Map<string,string>()
let fieldErrors: Record<string,string> = {}
let undoAction: (() => void) | undefined
let undoLabel = ''
const referenceOpenIds=new Set<number>()
let recordingId = ''
let recordingCreatedAt = ''
function modelKeyScope() { return providers.provider + (providers.provider === 'minimax' ? ':'+providers.region : '') }
function speechKeyScope() { return providers.speech === 'asr-1.0' ? 'minimax:'+providers.speechRegion : 'dashscope' }
function fieldError(id: string, message: string) {
  fieldErrors[id] = message
  render()
  content.querySelector<HTMLElement>('#'+id)?.focus()
  return false
}
function markFieldErrors() {
  for (const [id,message] of Object.entries(fieldErrors)) {
    const field=content.querySelector<HTMLElement>('#'+id)
    if (!field) continue
    field.setAttribute('aria-invalid','true')
    field.setAttribute('aria-describedby',id+'-error')
    field.insertAdjacentHTML('afterend',`<p class="field-error" role="alert" id="${id}-error">${esc(message)}</p>`)
  }
}
function offerUndo(label: string, undo: () => void) { undoLabel=label; undoAction=undo }
function validQuestions(texts:string[], field='raw') {
  if (!texts.length) return fieldError(field,'请填写至少一道面试题，每行一道。')
  if (texts.length>30) return fieldError(field,'最多支持 30 道主问题，当前有 '+texts.length+' 道。请分成多场练习，内容尚未导入。')
  const index=texts.findIndex(text=>text.length>500)
  if(index>=0) return fieldError(field,`第 ${index+1} 题超过 500 字，请精简后重试。原文已保留。`)
  return true
}
function dialogueDirty(){return providers.provider!==savedProviders.provider||providers.region!==savedProviders.region||providers.dialogue!==savedProviders.dialogue||modelKeyDrafts.size>0}
function speechDirty(){return providers.speech!==savedProviders.speech||providers.speechRegion!==savedProviders.speechRegion||providers.shared!==savedProviders.shared||speechKeyDrafts.size>0}
function configDirty(){return dialogueDirty()||speechDirty()}
function updateConfigurationStatus(){
  const model=content.querySelector('#dialogue-save-status'),speech=content.querySelector('#speech-save-status')
  if(model)model.textContent=dialogueDirty()?'对话配置未保存':modelConfigured?'对话配置已保存（连接状态以测试结果为准）':'尚未配置对话 API Key'
  if(speech)speech.textContent=speechDirty()?'语音配置未保存':speechConfigured?'语音配置已保存（连接状态以测试结果为准）':'尚未配置语音 API Key'
  const warning=content.querySelector('#config-unsaved');if(warning){warning.textContent=configDirty()?'有尚未保存的模型配置。切换页面保留输入，刷新或关闭会丢失未保存内容。':''}
}
async function persistSettings(service:'dialogue'|'speech') {
  const scope=service==='dialogue'?modelKeyScope():speechKeyScope()
  const response=await remote<{shared:boolean;modelConfigured:boolean;speechConfigured:boolean}>('/settings/'+service,'PATCH',service==='dialogue'?{provider:providers.provider,region:providers.region,model:providers.dialogue.trim(),key:modelKeyDrafts.get(scope)?.trim()||undefined}:{speech:providers.speech,region:providers.speechRegion,shared:providers.shared,key:speechKeyDrafts.get(scope)?.trim()||undefined})
  if(service==='dialogue'){
    savedProviders={...savedProviders,provider:providers.provider,region:providers.region,dialogue:providers.dialogue}
    modelConfigured=response.modelConfigured ?? (Boolean(modelKeyDrafts.get(scope))||savedModelScope===scope)
    savedModelScope=modelConfigured?scope:'';modelKeyDrafts.delete(scope)
    if(response.shared===false&&savedProviders.shared){providers.shared=false;savedProviders.shared=false}
  }else{
    savedProviders={...savedProviders,speech:providers.speech,speechRegion:providers.speechRegion,shared:providers.shared}
    speechKeyDrafts.delete(scope)
  }
  speechConfigured=response.speechConfigured ?? speechConfigured
  savedSpeechScope=speechConfigured&&!savedProviders.shared?(savedProviders.speech==='asr-1.0'?'minimax:'+savedProviders.speechRegion:'dashscope'):''
}

let importFailure = ''
let speechConfigured = false
let recorder: MediaRecorder | null = null
let acquiring = false
let recordTarget = ''
let timer: ReturnType<typeof setTimeout>
let providers = { provider: 'minimax', region: 'cn', dialogue: 'MiniMax-M3.1-Flash', speech: 'asr-1.0', shared: false,speechRegion:'cn' }
let savedProviders={...providers}


function label(item: Question) {
  const main = questions.filter(q => !q.parentId)
  const number = main.findIndex(q => q.id === (item.parentId || item.id)) + 1
  return item.parentId ? `追问${number}-${item.followupNumber}` : `第 ${number} 题`
}
function migrateQuestions(items: Question[]) {
  let parent: Question | undefined
  for (const item of items) {
    if (item.source.startsWith('主动追问') && parent && !item.parentId) item.parentId = parent.id
    if (!item.parentId) parent = item
    else if (!item.followupNumber) item.followupNumber = Math.max(0, ...items.filter(q => q !== item && q.parentId === item.parentId).map(q => q.followupNumber || 0)) + 1
  }
}
function esc(value: string) {
  const replacements: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return value.replace(/[&<>"']/g, character => replacements[character])
}
function button(label: string, action: string, primary = false, disabled = false) {
  return `<button data-action="${action}" ${primary ? 'class="primary"' : ''} ${disabled ? 'disabled' : ''}>${label}</button>`
}
function flash(message: string) {
  notice.textContent = message
  clearTimeout(timer)
  timer = setTimeout(() => { notice.textContent = '' }, 3400)
}
function heading(title: string, subtitle: string) {
  return `<div class="ink" data-enter><h1>${title}</h1><p>${subtitle}</p></div>`
}
function mediaUrl(url?: string) {
  return url && /^\/api\/workspace\/media\/[a-f0-9-]{36}$/.test(url) ? url : ''
}
function player(url?: string, seconds?: number) {
  const source = mediaUrl(url)
  return source ? `<audio controls preload="metadata" src="${source}${seconds === undefined ? '' : '#t=' + seconds}"></audio>` : ''
}
function question(text: string, source: string): Question {
  return { id: ++questionId, text, source, transcript: '' }
}
function stashCoaching() {
  const item = questions.find(q => q.id === coachingOwner)
  if (item) item.coachingDraft = {concern,guidance,draft,audio:draftAudio,editing:editingAnswer}
}
function resetCoaching() {
  stashCoaching()
  concern = ''; guidance = ''; draft = ''; draftAudio = ''; editingAnswer = false; coachingOwner = undefined
}
function loadCoaching(item?: Question) {
  if (!item || coachingOwner === item.id) return
  resetCoaching()
  coachingOwner = item.id
  const value = item.coachingDraft
  if (value) { concern=value.concern; guidance=value.guidance; draft=value.draft; draftAudio=value.audio; editingAnswer=value.editing }
}
async function remote<T>(path = '', method = 'GET', body?: unknown): Promise<T> {
  const blob = body instanceof Blob
  const response = await fetch('/api/workspace' + path, {
    method, headers: body === undefined ? undefined : { 'Content-Type': blob ? body.type || 'application/octet-stream' : 'application/json' },
    body: body === undefined ? undefined : blob ? body : JSON.stringify(body),
  })
  const result = await response.json()
  if (response.status === 401) location.assign('/account?next=/workspace')
  if (!response.ok) {
    const error = new Error(result.error)
    if (response.status === 409 && !path) blocked = true
    throw error
  }
  return result
}
function ai<T>(task: string, input: unknown, extra: { link?: string; images?: string[] } = {}) {
  return remote<T>('/ai/' + task, 'POST', { input, ...extra })
}
function mediaId(url: string) {
  const id = /^\/api\/workspace\/media\/([a-f0-9-]{36})$/.exec(url)?.[1]
  if (!id) throw new Error('请先上传文件。')
  return id
}
async function upload(file: Blob, name: string) {
  return (await remote<{ url: string }>('/media?name=' + encodeURIComponent(name), 'POST', file)).url
}
function archiveCurrentReport() {
  if(reportKind==='录音'){
    if(!originalAudio&&!segments.length)return
    recordingId ||= crypto.randomUUID();recordingCreatedAt ||= new Date().toISOString()
    const index=recordingArchives.findIndex(item=>item.id===recordingId)
    const profile=practiceProfile || (selectedResume>=0?resumes[selectedResume] as PracticeProfile:undefined)
    const entry={id:recordingId,createdAt:recordingCreatedAt,reportSnapshot,jd,profile,title:originalName || '文字复盘',audio:originalAudio,segments,report,confirmed,stale,activeResume:selectedResume}
    const previous=index<0?undefined:recordingArchives[index]
    const {updatedAt:oldTime,...oldEntry}=previous || {}
    const copy=structuredClone({...entry,updatedAt:JSON.stringify(oldEntry)===JSON.stringify(entry)?oldTime:new Date().toISOString()})
    if(index<0)recordingArchives.unshift(copy);else recordingArchives[index]=copy
    return
  }
  if(!questions.length&&!raw.trim()&&!jd.trim()&&!screenshots.length)return
  const legacy=startedAt?archives.find(item=>item.createdAt===startedAt):undefined
  practiceSessionId ||= legacy?.sessionId || crypto.randomUUID()
  practiceCreatedAt ||= legacy?.createdAt || startedAt || new Date().toISOString()
  const index=archives.findIndex(item=>item.sessionId===practiceSessionId || (legacy && item===legacy))
  const entry={sessionId:practiceSessionId,title:practiceName.trim() || questions[0]?.text || '未命名练习',createdAt:practiceCreatedAt,startedAt,profile:practiceProfile,reportSnapshot,questions,report,stale,jd,skipped:[...skipped],draftStage:stage,active,raw,tab,manualMode,link,screenshots,goalConfirmed,questionsConfirmed}
  const previous=index<0?undefined:archives[index]
  const {updatedAt:oldTime,...oldEntry}=previous || {}
  const copy=structuredClone({...entry,updatedAt:JSON.stringify(oldEntry)===JSON.stringify(entry)?oldTime:new Date().toISOString()})
  if(index<0)archives.unshift(copy);else archives[index]=copy
}
function snapshot() {
  updateReportValidity()
  stashCoaching()
  archiveCurrentReport()
  return {
    favorites,practiceSessionId,practiceCreatedAt,goalConfirmed, returnToGoal, toolTab, pendingReport, reportSnapshot,goalReview,questionsConfirmed, manualMode, recordingId, recordingCreatedAt,
    concern, guidance, draft, draftAudio, selectedAnswerId, practiceProfile, targetRole, practiceName, startedAt, page, stage, tab, questions, active, jd, link, raw, screenshots, resumes, resumeIndex, selectedResume, originalAudio,
    originalName, segments, confirmed, report, reportKind, archives, recordingArchives, reports: [...savedReports], questionId, stale, evidence, missing, skipped: [...skipped],
  }
}
function queueSave() {
  if (!ready || blocked) return
  localRevision++
  saveStatus = '待保存'
  updateSaveStatus()
  clearTimeout(saveTimer)
  saveTimer = setTimeout(save, 240)
}
function save() {
  clearTimeout(saveTimer)
  saveChain = saveChain.then(async () => {
    if (!ready || blocked) return false
    saveStatus = '保存中…'
    updateSaveStatus()
    const revision = localRevision
    const result = await remote<{ version: number }>('', 'PUT', { version: workVersion, state: snapshot() })
    workVersion = result.version
    savedRevision = revision
    saveStatus = '已保存'
    updateSaveStatus()
    return true
  }).catch(error => { saveStatus = blocked ? '其他窗口已更新，请保留本地草稿后刷新' : '保存失败，请重试'; updateSaveStatus(); flash(error.message); return false })
  return saveChain
}
function updateSaveStatus() {
  const element = document.querySelector('#save-status')
  if (element) element.textContent = '练习内容'+saveStatus
  const recovery = document.querySelector<HTMLElement>('#save-recovery')
  if (recovery) recovery.hidden = !blocked && !saveStatus.startsWith('保存失败')
}
function failureCard(task:string,message:string,retryAction:string){
  const service=task.includes('语音')?(savedProviders.speech==='asr-1.0'?'MiniMax': '阿里云'):savedProviders.provider==='kimi'?'Kimi':savedProviders.provider==='minimax'?'MiniMax':savedProviders.provider==='dashscope'?'阿里云':'OpenAI'
  const model=task.includes('语音')?savedProviders.speech:savedProviders.dialogue
  return `<section class="task-failure" role="alert"><strong>${esc(task)}未完成</strong><p>${esc(message)}</p><small>调用服务：${esc(service)} · ${esc(model)}</small><p>原回答、录音及已有报告仍保留；不会用演示结果替代。</p>${button('重试此操作','retry-task-'+retryAction)}<p class="muted">服务繁忙时请稍后手动重试；此处不保证恢复时间。</p></section>`
}
function operationPanel() {
  if (connectionTesting || speechTesting) return ''
  if(page===operationOrigin && operationAction && content.querySelector(`[data-action="${operationAction}"]`)) return ''
  if (operationMessage) return `<div class="hint" role="status">${esc(operationMessage)}${pendingReport?' · 可切换页面，报告将在后台继续生成。':''}</div>`
  if (operationError && !reportError && !followupError && !connectionResult && !speechTestResult) return failureCard('上一项模型操作',operationError,operationAction || 'operation-result')
  return operationCompleted && page!==operationOrigin ? `<p class="hint" role="status">${pendingReport?'报告':'上一项操作'}已完成。${button(report.length?'查看报告':'返回结果页面','operation-result')}</p>` : ''
}
window.addEventListener('beforeunload', event => {
  if (configDirty() || (working && !pendingReport) || recorder || acquiring || localRevision > savedRevision) { event.preventDefault(); event.returnValue = '' }
})
function answersForReport(): Question[] {
  return (reportKind === '练习' ? questions : segments.map((item, index) => ({ item, index }))
    .filter(({ item }) => item.role === '候选人')
    .map(({ item, index }) => ({ id: -index - 1,
      text: segments.slice(0, index).findLast(segment => segment.role === '面试官')?.text || '真实面试作答',
      transcript: item.text, source: formatTime(item.time) }))).filter(item => item.transcript.trim())
}
function selectedProfile() {
  if (goalConfirmed) return practiceProfile
  return page === '练习' && (stage === '导入' || stage === '确认') ? resumes[selectedResume] : practiceProfile
}
function profileContext() {
  const profile = selectedProfile()
  return { role: profile?.role || '', resume: profile?.text || '' }
}
function profilePicker() {
  return `<label for="resume-pick">本场简历与目标岗位（必选）</label><select id="resume-pick" required><option value="-1">请选择一组资料</option>${resumes.map((item, i) => `<option value="${i}" ${selectedResume === i ? 'selected' : ''}>${esc(item.name)} · ${esc(item.role || '请先补充目标岗位')}</option>`).join('')}</select>`
}
function bindProfile() {
  const item = resumes[selectedResume]
  if (!item?.role?.trim() || !item.text.trim()) return fieldError('resume-pick','请选择已填写简历正文和目标岗位的资料。')
  practiceProfile = {id:item.id!,name:item.name,role:item.role.trim(),text:item.text,file:item.file}
  return true
}
function profileNotice(allowBinding = true) {
  return practiceProfile ? `<p class="hint">本场资料：${esc(practiceProfile.name)} · 目标岗位：${esc(practiceProfile.role)}</p>` : !allowBinding ? '<p class="hint warn">此历史练习未绑定简历和目标岗位。</p>' : `<div class="hint warn"><p>此历史练习未绑定简历和目标岗位，请选择资料后补充绑定。</p>${profilePicker()}${button('绑定本场资料', 'bind-profile')}${button('去简历库创建或编辑', 'page-简历库')}</div>`
}
function reportInput() {
  return { answerRevision:crypto.randomUUID(),defaultUncovered:true,skipped:[...skipped],dimensions, ...profileContext(), jd, questions: reportKind === '练习' ? questions.map(item => item.text) : segments.filter(item => item.role === '面试官').map(item => item.text),
    answers: answersForReport().map(({ id, text, transcript, source,failed,pending }) => ({ id, text, transcript, source,failed:Boolean(failed&&!transcript.trim()),pending:Boolean(pending) })) }
}
function evaluationKey(input=reportInput()) {return JSON.stringify([input.role,input.resume,input.jd,input.questions,input.answers.map(a=>[a.id,a.text,a.transcript])])}
function updateReportValidity(){
  if(!report.length||!reportSnapshot)return
  if(reportSnapshot.contextKey)stale=reportSnapshot.contextKey!==evaluationKey()
  else if(reportSnapshot.jd!==jd || reportSnapshot.role!==profileContext().role || reportSnapshot.answers.some(old=>!answersForReport().some(now=>now.id===old.id&&now.text===old.text&&now.transcript===old.transcript)))stale=true
}
async function makeScore() {
  const input=pendingReport?.input || reportInput()
  const capturedAnswers=input.answers.map(answer=>({...answer,displayLabel:reportKind==='练习'?label(questions.find(item=>item.id===answer.id) || answer):'录音 · '+answer.source}))
  let rows:(Partial<ReviewedRow>&{tip?:string})[]=[]
  let summary='全部维度由未覆盖维度按约定默认计分，按默认分计入，非实际评估。'
  if(skipped.size!==dimensions.length){
    if(!pendingReport){pendingReport={id:crypto.randomUUID(),input,kind:reportKind,skipped:[...skipped]};if(!await save()){pendingReport=undefined;throw new Error('任务开始前保存失败，请先处理保存问题。')}}
    const job=pendingReport
    type Result={status?:string;rows:typeof rows;error?:string;summary?:string;schemaVersion?:number;answerRevision?:string}
    try{
      let result=await remote<Result>('/ai/score','POST',{input:job.input,jobId:job.id})
      while(result.status==='running'){await new Promise(resolve=>setTimeout(resolve,1000));result=await remote<Result>('/report-jobs/'+job.id)}
      if(result.status==='failed')throw new Error(result.error || '报告生成失败，请重试。')
      if(result.schemaVersion===1 && result.answerRevision!==job.input.answerRevision)throw new Error('报告版本不一致，请重新评估。')
      rows=result.rows;summary=result.summary || '以下依据整场回答评估。部分历史报告可能没有亮点与不足分析，可手动重新评估。'
    }catch(error){pendingReport=undefined;throw error}
    pendingReport=undefined
    if(!Array.isArray(rows)||rows.length!==6)throw new Error('模型未返回完整六维评分。')
  }
  report=dimensions.map((_,index):ScoreRow=>{
    const row=rows[index]
    if(skipped.has(index)||(input.defaultUncovered&&(row?.status==='default'||row?.status==='insufficient_evidence'))){skipped.add(index);return{score:60,status:'default',label:'未覆盖 · 默认分'}}
    const item=capturedAnswers.find(answer=>answer.id===row?.answerId)
    const quote=typeof row?.quote==='string'?row.quote.trim():''
    const verified=item&&quote&&item.transcript.includes(quote)?{...item,transcript:quote}:undefined
    if(row?.status==='needs_review'||row?.status==='insufficient_evidence'||!verified)return{score:null,status:row?.status==='insufficient_evidence'?'insufficient_evidence':'needs_review',label:'分析待核查',tip:row?.reason || '缺少可核对的作答依据，请重新评估。'}
    if(typeof row.score!=='number'||!Number.isFinite(row.score)||row.score<0||row.score>100)throw new Error('评分数据无效，请重试。')
    const analysis=row.scope&&row.reason&&Array.isArray(row.strengths)&&Array.isArray(row.shortcomings)?{scope:row.scope,reason:row.reason,strengths:row.strengths,shortcomings:row.shortcomings}:undefined
    return{score:Math.round(row.score),status:'evaluated',question:verified,label:'已有作答证据',tip:row.tip,analysis}
  })
  reportSnapshot={contextKey:evaluationKey(input),answers:structuredClone(capturedAnswers),summary,revision:input.answerRevision,role:input.role,jd:input.jd}
  stale=false;startedAt ||= new Date().toISOString();archiveCurrentReport();evidence=0;reportDetailTab='analysis';reportAnswerId=undefined;resetCoaching()
}
function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}
async function prepare() {
  importFailure = ''
  if (!goalConfirmed || !practiceProfile) throw new Error('请先确认本场简历和目标岗位。')
  if (tab === '截图' && !screenshots.length) { fieldError('shots','请先上传截图。'); return }
  if (tab === '根据 JD 出题' && !jd.trim()) { fieldError('jd','请填写岗位描述（JD）。'); return }
  if (tab === '手动输入' && !raw.trim() && !jd.trim()) { fieldError('raw','出题参考资料与岗位描述至少填写一项。'); return }
  const source = tab
  try {
    const result = await ai<{ questions: unknown; jd?: unknown }>('jd', {
      jd, material: source === '手动输入' ? raw : undefined, ...profileContext(),
    }, source === '截图' ? { images: screenshots.map(item => mediaId(item.url)) } : {})
    const extracted = Array.isArray(result.questions) ? result.questions.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : []
    if (!extracted.length) throw new Error('模型没能从这些材料生成题目，请检查材料是否清晰且包含岗位或面试信息。')
    if (!validQuestions(extracted, source==='根据 JD 出题'?'jd':source==='截图'?'shots':'raw')) throw new Error('生成的题目超过题单限制，请精简材料后重试。')
    questions = extracted.map(text => question(text.trim(), source + ' · AI 生成'))
    if (!jd.trim() && typeof result.jd === 'string') jd = result.jd.trim().slice(0, 15_000)
    stage = '确认'
  } catch (error) {
    importFailure = error instanceof Error ? error.message : '题单生成失败。'
    throw error
  }
}

function useManualQuestions() {
  if (!goalConfirmed) return flash('请先确认本场练习目标。')
  const lines = raw.split('\n').map(line => line.trim()).filter(Boolean)
  if (!validQuestions(lines)) return
  importFailure = ''
  questions = lines.map(text => question(text, '手动输入'))
  stage = '确认'
  render()
}

function goalSetup() {
  return `${heading('确认本场练习目标', '先确认本场简历与目标岗位，再导入已有题目或出题资料。')}
  <section class="panel">${profilePicker()}<div class="tools">${button('确认目标，导入材料', 'confirm-goal', true)}${button('创建简历和目标岗位', 'create-goal')}</div></section>`
}
function setup() {
  if (!goalConfirmed || !practiceProfile) return goalSetup()
  const existing=tab==='手动输入' && manualMode==='已有题目'
  const importer=tab==='截图'?`<label for="shots">上传面经或岗位截图（必填）</label><input type="file" id="shots" accept="image/*" multiple><p class="muted">最多 12 张，按排列顺序读取。</p>
    ${screenshots.map((item,i)=>`<div class="question row"><a href="${mediaUrl(item.url)}" target="_blank" rel="noopener" aria-label="预览截图 ${i+1}"><img class="thumb" src="${mediaUrl(item.url)}" alt="截图 ${i+1}"></a><span>${esc(item.name)}</span><div class="tools">${button('上移','imup-'+i,false,i===0)}${button('下移','imdown-'+i,false,i===screenshots.length-1)}${button('移除','imremove-'+i)}</div></div>`).join('')}`
    : tab==='手动输入'?`<label for="manual-mode">输入内容类型</label><select id="manual-mode"><option ${manualMode==='已有题目'?'selected':''}>已有题目</option><option ${manualMode==='参考资料'?'selected':''}>参考资料</option></select>
    <label for="raw">${existing?'已有面试题（必填，每行一道）':'出题参考资料'}</label><textarea id="raw" ${existing?'required':''} placeholder="${existing?'每行填写一道完整问题':'粘贴面经、岗位资料或出题主题'}">${esc(raw)}</textarea>`:''
  const actionName=existing?'使用这些题目':tab==='截图'?'根据截图生成面试题':tab==='根据 JD 出题'?'根据 JD 生成面试题':'根据资料生成面试题'
  return `${heading('准备面试题目','导入材料，核对题目与顺序后开始练习。')}
  <div class="goal-summary"><div><strong>本场简历与目标岗位</strong><p>${esc(practiceProfile!.name)} · ${esc(practiceProfile!.role)}</p></div>${button('更换','change-goal')}</div>
  <section class="panel"><h2>题目来源</h2><div class="tabs" aria-label="题目来源">${['手动输入','截图','根据 JD 出题'].map(name=>`<button data-action="tab-${name}" aria-pressed="${tab===name}">${name==='练习'?'模拟面试':name==='练习记录'?'面试记录':name}</button>`).join('')}</div>
  <label for="practice-name">本场名称（选填）</label><input id="practice-name" value="${esc(practiceName)}" placeholder="例如：产品经理一面"><p class="muted">留空将使用首道题目命名。</p>
  ${importer}
  <p class="muted">${existing?'直接使用输入题目，不调用 AI。最多 30 道主问题，每题最多 500 字。':'AI 默认生成 6 道面试题，每题最多 500 字，再由你核对；不保证逐字还原材料中的原题。'}</p>
  <label for="jd">岗位描述（JD）${tab==='根据 JD 出题'?'（必填）':'（选填）'}</label><textarea id="jd" ${tab==='根据 JD 出题'?'required':''} placeholder="粘贴岗位职责和要求">${esc(jd)}</textarea>
  ${tab==='手动输入'&&!existing?'<p class="muted">出题参考资料与岗位描述至少填写一项。</p>':''}
  <div class="example-entry"><button class="text-action" data-action="sample">试用示例</button><span class="muted">填入已有题目示例</span></div>
  ${importFailure?`<p class="field-error" role="alert">${esc(importFailure)}</p>`:''}
  <div class="action-footer">${button(actionName,existing?'manual-questions':'prepare',true)}</div></section>`
}
function confirmQuestions() {
  return `${heading('核对题目与顺序', '核对题目和顺序，准备好后开始录音练习。')}<p class="hint">所选资料：${esc(practiceProfile?.name || '尚未选择')} · ${esc(practiceProfile?.role || '尚未填写目标岗位')} ${button('更换简历与岗位', 'change-goal')}</p>
  <section class="panel"><h2>面试题 · ${questions.length} 道</h2>
  ${(importFailure || (tab === '截图' && questions.some(item => item.source.includes('待人工核对')))) ? `<div class="hint warn" role="status"><p>${esc(importFailure || '截图未自动提题，可以检查模型设置后重试。')}</p><div class="tools">${button('打开模型设置', 'page-模型设置')}${button('根据截图重新生成', 'prepare')}</div></div>` : ''}
  ${questions.map((item, i) => `<div class="question"><div class="row"><label for="question-${i}">${label(item)}</label><small>${esc(item.source)}</small></div>
  <textarea id="question-${i}" data-question="${i}" placeholder="编辑面试题，每题最多 500 字">${esc(item.text)}</textarea>
  ${item.source.startsWith('截图 · AI') ? screenshots.map((image, index) => `<a href="${mediaUrl(image.url)}" target="_blank" rel="noopener">来源截图 ${index + 1} ↗</a> `).join('') : ''}
  ${item.source.startsWith('小红书链接 · AI') && /^https:\/\//.test(link) ? `<a href="${esc(link.split(/\s/)[0])}" target="_blank" rel="noopener">查看面经原文 ↗</a>` : ''}
  ${item.source.startsWith('截图') && screenshots.find(image => item.source.includes(image.name)) ? `<a href="${mediaUrl(screenshots.find(image => item.source.includes(image.name))!.url)}" target="_blank" rel="noopener">打开来源截图 ↗</a>` : ''}
  <div class="tools">${button('上移', 'up-' + i, false, i === 0)}${button('下移', 'down-' + i, false, i === questions.length - 1)}${button('删除', 'delete-' + i)}</div></div>`).join('')}
  <div class="tools">${button(startedAt?'保存并继续作答':'确认并开始练习', 'start', true)}${button('新增一道题', 'add')}${button('返回编辑材料', 'back')}</div></section>`
}
let reading: SpeechSynthesisUtterance | undefined
function stopReading() {
  if (!reading) return
  reading = undefined
  window.speechSynthesis?.cancel()
  syncReading()
}
function syncReading() {
  const button = document.querySelector<HTMLButtonElement>('[data-action="read-question"]')
  if (button) { button.textContent = reading ? '停止播放题目' : '播放题目'; button.setAttribute('aria-pressed', String(Boolean(reading))) }
}
function readQuestion() {
  if (reading) return stopReading()
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return flash('此浏览器不支持题目朗读，请使用支持语音合成的浏览器。')
  const utterance = new SpeechSynthesisUtterance(questions[active].text)
  utterance.lang = 'zh-CN'
  const voice = window.speechSynthesis.getVoices().find(voice => /^zh[-_]CN$/i.test(voice.lang))
  if (voice) utterance.voice = voice
  utterance.onend = () => { if (reading === utterance) { reading = undefined; syncReading() } }
  utterance.onerror = event => {
    if (reading !== utterance) return
    reading = undefined
    syncReading()
    if (!['canceled','interrupted'].includes(event.error)) flash('题目播放失败，请检查系统语音和声音输出后重试。')
  }
  reading = utterance
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
  syncReading()
}
window.addEventListener('pagehide', stopReading)
function recordingControl(target: string) {
  if (recorder || acquiring) {
    return `<div class="tools"><span class="recording" role="status">${recorder ? '● 正在录音' : esc(recordingMessage || '正在等待麦克风权限')}</span>${recorder ? '<span id="recording-time">' + formatTime(Math.floor((Date.now() - recordingStarted) / 1000)) + '</span><meter id="input-level" min="0" max="1" value="0" aria-label="麦克风输入音量"></meter>' : ''}${recorder && (target === recordTarget||recordTarget==='mic-test') ? button(recordTarget==='mic-test'?'停止试听':'停止录音', 'stop', true) : ''}</div>`
  }
  return `<div class="record-tools">${button((target==='draft'?draftAudio:questions[active]?.audio)?'重新录音':'开始录音', 'record-' + target, true)}</div>`
}
function answerStatus(item:Question) { return [item.transcriptCandidate!==undefined?'机器转写，待核对':item.transcript.trim()?'已填写答案':'等待作答',item.audio?'原声已保存':'',item.pending?'转写中':item.failed?'转写失败':''].filter(Boolean).join(' · ') }
function microphoneControls(){return `<div class="microphone-controls"><label for="microphone-device">录音麦克风</label><select id="microphone-device"><option value="">系统默认麦克风</option>${microphones.map((m,i)=>`<option value="${esc(m.deviceId)}" ${selectedMicrophone===m.deviceId?'selected':''}>${esc(m.label||'麦克风 '+(i+1))}</option>`).join('')}</select><div class="tools">${button('获取可用麦克风','microphones')}${button('录制试听','record-mic-test')}</div>${microphonePreview?`<p class="muted">本机试听，不上传，不调用模型。</p><audio controls src="${microphonePreview}"></audio>`:''}<p id="mic-warning" class="warn" role="status">${esc(micWarning)}</p></div>`}
function favoriteCandidate(item:Question,source:Favorite['source'],snapshot=false){
  return {sessionId:reportKind==='录音'?recordingId:practiceSessionId,questionId:item.id,source,question:item.text,answer:source==='AI参考答案'?(item.reference || ''):item.transcript,targetRole:(snapshot?reportSnapshot?.role:practiceProfile?.role)||practiceProfile?.role||'未绑定岗位'}
}
function matchingFavorite(item:ReturnType<typeof favoriteCandidate>){return favorites.find(entry=>entry.sessionId===item.sessionId&&entry.questionId===item.questionId&&entry.source===item.source&&entry.question===item.question&&entry.answer===item.answer&&entry.targetRole===item.targetRole)}
function favoriteControl(item:Question,source:Favorite['source'],snapshot=false){
  const candidate=favoriteCandidate(item,source,snapshot),selected=Boolean(matchingFavorite(candidate))
  const action=snapshot?'snapshot-'+item.id:source==='AI参考答案'?'reference':'own'
  return `<button data-action="favorite-${action}" aria-pressed="${selected}" ${!candidate.answer.trim()||Boolean(recorder)||acquiring?'disabled':''}>${selected?'取消收藏':'收藏'}${source}</button>`
}
function favoritesPage(){
  return `${heading('我的收藏','集中复习已收藏的认可答案和AI参考答案。')}<p class="hint">收藏保留当时的题目、目标岗位和答案快照，后续修改或重新生成不会覆盖。收藏不参与评分。</p>
  ${favorites.length?[...favorites].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(entry=>`<section class="panel favorite-card"><div class="row"><span class="badge">${esc(entry.source==='认可答案'?'自己的认可答案':'AI参考答案')}</span>${button('取消收藏','unfavorite-'+entry.id)}</div><h2>${esc(entry.question)}</h2><p class="muted">目标岗位：${esc(entry.targetRole)} · 收藏于 ${esc(new Date(entry.createdAt).toLocaleString('zh-CN'))}</p><div class="answer-snapshot">${esc(entry.answer)}</div></section>`).join(''):'<section class="panel"><h2>还没有收藏</h2><p>在作答区或参考答案旁点击收藏，即可在这里集中复习。</p></section>'}`
}
function practice() {
  const item=questions[active];loadCoaching(item)
  const reviewing=item.transcriptCandidate!==undefined&&!editingAnswer
  return `${heading('模拟面试',label(item)+' · 第 '+(active+1)+' / '+questions.length+' 题 · 结束后查看整场评分')}
  ${profileNotice(false)}<p class="muted session-name">当前练习：${esc(practiceName.trim() || questions[0]?.text || '未命名练习')}</p><section class="panel"><div class="row"><span class="badge">${esc(item.source)}</span><small id="answer-status">${answerStatus(item)}</small></div>
  <h2 style="margin-top:16px">${esc(item.text)}</h2><div class="tools">${button('播放题目','read-question',false,Boolean(recorder)||acquiring||!('speechSynthesis'in window))}</div>
  <details class="microphone-setup" ${microphoneSetupOpen?'open':''}><summary>麦克风选择与试听</summary>${microphoneControls()}</details>
  ${recordingControl(editingAnswer?'draft':'answer')}${(recorder||acquiring)?`<p class="warn" id="recording-warning" role="status">${esc(micWarning)}</p>`:''}${player(editingAnswer?draftAudio:item.audio)}
  ${item.audioWarning&&!editingAnswer?`<p class="hint warn">${esc(item.audioWarning)}</p>`:''}
  ${!editingAnswer&&item.pending?'<p class="muted" data-pending>原声已保存 · 转写中</p>':''}
  ${item.transcriptionError&&!editingAnswer?failureCard('语音转写',item.transcriptionError,'retry-answer'):''}
  ${item.audio&&!editingAnswer?button(item.pending?'正在转写…':item.failed?'重试转写':'重新转写现有录音','retry-answer',false,Boolean(item.pending)):''}
  <label for="${editingAnswer?'draft':'answer-text'}">${editingAnswer?'重答草稿（尚未采用）':reviewing?'本题答案（机器转写，待核对）':'本题答案'}</label>
  <p class="muted">${editingAnswer?'草稿自动暂存，保存为当前答案后才替换认可版本。':reviewing?'转写已完成，请回听核对，可直接修改。确认前不用于评分。':'可直接输入，修改后自动保存。'}</p>
  <textarea id="${editingAnswer?'draft':'answer-text'}" placeholder="输入文字或校对转写">${esc(editingAnswer?draft:reviewing?item.transcriptCandidate!:item.transcript)}</textarea>
  ${editingAnswer?`<div class="tools">${button('保存为当前答案','adopt',true)}${button('取消重答','cancel-redraft')}</div>${draftNeedsReview?'<p class="warn">机器转写，保存前请回听核对。</p>':''}<details><summary>查看当前认可的答案</summary><p class="answer-snapshot">${esc(item.transcript)}</p></details>`:reviewing?`<div class="transcript-actions"><div class="transcript-actions-row">${button('上一题','prev',false,active===0||Boolean(recorder)||acquiring)}<div class="transcript-confirm-actions">${button('保存本题','confirm-answer-transcript')}${button(active===questions.length-1?'确认并结束作答':'确认并下一题 →','confirm-answer-advance',true)}</div></div><button class="text-action discard-transcript" data-action="discard-answer-transcript">放弃本次转写</button></div>`:button(item.coachingDraft?.draft?'继续重答':'重新回答','begin-redraft')}
  ${!reviewing&&!editingAnswer?`<div class="tools" id="own-favorite-control">${favoriteControl(item,'认可答案')}</div>`:editingAnswer&&item.transcript.trim()?`<div class="tools">${favoriteControl(item,'认可答案')}<small class="muted">收藏当前认可版本，重答草稿需先采用。</small></div>`:''}
  ${reviewing?'':`<div class="tools question-navigation">${button('上一题','prev',false,active===0||Boolean(recorder)||acquiring)}${button('下一题','next',false,active===questions.length-1||Boolean(recorder)||acquiring)}</div><div class="action-footer">${button('结束并检查评分维度','finish',active===questions.length-1,Boolean(recorder)||acquiring)}</div>`}</section>`
}
function finishPractice(){
  if(questions.some(q=>q.pending)){flash('正在转写，请等待完成后核对；或先输入文字。');return}
  const pending=questions.findIndex(q=>q.transcriptCandidate!==undefined)
  if(pending>=0){resetCoaching();active=pending;flash('请先核对并确认机器转写，或放弃本次转写后再结束。');return}
  stage='覆盖';missing=null;skipped.clear();supplemental.clear()
}
function reportFeedback() {
  if (reportBusy && operationMessage) return ''
  return reportBusy ? `<p class="hint" role="status">${esc(reportBusy)}</p>` :
    reportError ? failureCard('整场报告分析',reportError,report.length?'rescore':'score') : ''
}
function coverage() {
  return `${heading('评分前检查', '直接根据本场已确认回答生成整场报告。')}
  <section class="panel"><h2>整场报告</h2>${reportFeedback()}
  <p>不再安排补答。一次分析六个维度，未覆盖的维度按默认 60 分计入，并明确标记为“默认分 · 非实际评估”。</p>
  <p class="muted">已有回答但内容薄弱会按实际表现评分；分析失败或引文无法核对，不会用默认分替代。</p>
  <div class="tools">${button(reportBusy?'正在生成报告…':'生成整场报告','score',true,Boolean(reportBusy))}${reportKind==='练习'?button('回到作答','practice'):button('返回录音稿','record-review')}</div></section>`
}
function snapshotAnswers() { return reportSnapshot?.answers || report.flatMap(row=>row.question?[row.question]:[]) }
function reportAnswerName(id:number) { const item=snapshotAnswers().find(item=>item.id===id);return item?.displayLabel?item.displayLabel: id<0?'录音作答':'第 '+(questions.findIndex(q=>q.id===id)+1)+' 题' }
function reviewPoint(point:ReviewPoint,kind:string) {
  return `<article class="review-point"><h3><span class="review-kind ${kind==='不足'?'gap':''}">${kind}</span>${esc(point.title)}</h3><p>${esc(point.analysis)}</p>${point.evidence.map(e=>`<div class="review-evidence"><small>依据 · ${esc(reportAnswerName(e.answerId))} · 本次报告答案快照</small><blockquote>“${esc(e.quote)}”</blockquote>${button('查看完整回答','report-answer-'+e.answerId)}</div>`).join('')}${!point.evidence.length?`<p class="muted">本条指出回答未说明的信息，未虚构引文。</p>${point.relatedAnswerIds.map(id=>button('查看'+reportAnswerName(id)+'原文','report-answer-'+id)).join('')}`:''}</article>`
}
function reportRubric(index:number) {
  return `<h3>这个维度考察什么</h3><table class="review-criteria"><thead><tr><th>考察点</th><th>判断标准</th></tr></thead><tbody>${reviewCriteria[index].map(c=>`<tr><td>${c[0]}</td><td>${c[1]}</td></tr>`).join('')}</tbody></table><h3 class="review-section-title">评分档位</h3>${scoreBands.map(b=>`<div class="review-band"><strong>${b[0]}</strong><span>${b[1]}</span></div>`).join('')}<p class="hint warn">未覆盖维度自动按默认60分计入，非实际评估；分析失败或引文无法核对时不计算有效总分。</p>`
}
function reportPage() {
  for(const row of report)if(!row.status&&!row.question&&row.label!=='未覆盖 · 默认分'){row.score=null;row.status='needs_review';row.label='分析待核查'}
  const total=report.length===6&&report.every(item=>item.score!==null)?report.reduce((sum,item,i)=>sum+item.score!*dimensions[i][1],0)/100:null
  const row=report[evidence]
  if(reviewAll)return allAnswers()
  const defaultRow=row?.status==='default'||row?.label==='未覆盖 · 默认分'
  const oldReport=report.some(item=>!item.analysis&&item.score!==null&&item.status!=='default'&&item.label!=='未覆盖 · 默认分')
  const detail=reportDetailTab==='rubric'?reportRubric(evidence):defaultRow?'<h3>本场未覆盖此维度，按默认分计入</h3><p>按约定以60分计入，非实际能力评估。因此不生成虚构的亮点、不足或引文。</p>':row?.score===null?`<h3>本维度分析待核查</h3><p>${esc(row.tip || '分析未完成，暂不展示分数。')}</p><p class="muted">这不表示候选人得0分。请核对回答后重新评估。</p>`:row?.analysis?`<small>评价范围</small><p>${esc(row.analysis.scope)}</p><div class="hint"><strong>为什么是 ${row.score} 分？</strong><p>${esc(row.analysis.reason)}</p></div><p class="muted">以下判断均关联本次报告的回答原文。</p>${row.analysis.strengths.map(point=>reviewPoint(point,'亮点')).join('') || '<p class="muted">本维度没有足够依据归纳亮点。</p>'}${row.analysis.shortcomings.map(point=>reviewPoint(point,'不足')).join('') || '<p class="muted">本维度暂未发现有依据的明显不足，不代表所有方面均已充分展示。</p>'}`:`<p>这份报告尚未保存维度分析，可重新评估获取亮点、不足及详细理由。</p>${row?.question?`<div class="review-evidence"><small>已保存的作答依据</small><blockquote>${esc(row.question.transcript)}</blockquote>${button('查看完整回答','report-answer-'+row.question.id)}</div>`:''}`
  return `<header class="report-title"><div><h1>整场面试报告</h1><p class="muted">${esc(practiceName || '本场面试')} · 整场六维评估</p></div><div class="tools">${button('返回作答修改','return-answers')}${button('查看全部回答原文','all-answers')}</div></header>${profileNotice(false)}${reportFeedback()}
  ${stale?'<div class="hint warn"><strong>作答已更新 · 等待手动重评</strong><p>下面仍是上次评估的答案快照，点击查看不会自动重新评分。</p></div>':''}
  <section class="panel report-overview"><div><small>加权总分 / 100</small><strong class="total">${total===null?'—':total.toFixed(2)}</strong><span class="badge">${total===null?'报告待核查':'六个维度 · 整场评估'}</span></div><div><h2>本场表现概览</h2><p>${esc(reportSnapshot?.summary || '选择评分维度查看已有作答依据；历史报告可重新评估获取详细分析。')}</p>${total===null?'<p class="warn">有维度缺少可核对分析，总分暂不计算，不能解释为0分。</p>':''}</div></section>
  ${(stale||oldReport||total===null)?`<div class="tools report-refresh">${button(reportBusy?'正在重新评估…':'重新评估整场','rescore',true,Boolean(reportBusy))}<small>手动评估完成后替换旧报告。</small></div>`:''}
  <h2>评分维度</h2><div class="review-grid"><nav class="review-nav" aria-label="六个评分维度">${report.map((item,i)=>`<button class="review-dimension" data-action="evidence-${i}" aria-pressed="${evidence===i}"><span class="row"><span>${dimensions[i][0]}</span><strong>${item.score===null?'—':item.score+' 分'}</strong></span>${item.score!==null?`<progress class="meter" max="100" value="${item.score}" aria-label="${dimensions[i][0]} ${item.score} 分"></progress>`:''}<small>权重 ${dimensions[i][1]}% · ${esc(item.label)}</small></button>`).join('')}</nav>
  <section class="panel review-detail" id="evidence" tabindex="-1"><div class="review-detail-head"><div><small>整场评分维度 · 权重 ${dimensions[evidence][1]}%</small><h2>${dimensions[evidence][0]}</h2><span class="badge">${defaultRow?'默认分 · 非实际评估':row?.score===null?'分析待核查':'已有作答依据'}</span></div><strong>${row?.score===null?'—':row?.score+' 分'}</strong></div>
  <div class="tabs review-tabs" role="tablist" aria-label="报告详情"><button role="tab" id="report-tab-analysis" aria-controls="report-detail-panel" tabindex="${reportDetailTab==='analysis'?0:-1}" data-action="report-tab-analysis" aria-selected="${reportDetailTab==='analysis'}">回答分析</button><button role="tab" id="report-tab-rubric" aria-controls="report-detail-panel" tabindex="${reportDetailTab==='rubric'?0:-1}" data-action="report-tab-rubric" aria-selected="${reportDetailTab==='rubric'}">评分细则</button></div><div role="tabpanel" id="report-detail-panel" aria-labelledby="report-tab-${reportDetailTab}">${detail}</div><div class="action-footer">${button('返回作答修改','return-answers')}</div></section></div>
  <div class="action-footer">${reportKind==='练习'?button('新建练习','new'):button('归档并复盘新录音','new-recording')}</div>`
}
function allAnswers() {
  return `${heading('全部回答原文','本次报告使用的答案快照，只读。修改请返回作答页。')}${button('返回整场报告','report-return')}${snapshotAnswers().map(item=>`<section class="panel"><h2>${esc(reportAnswerName(item.id))} · ${esc(item.text)}</h2><p class="answer-snapshot">${esc(item.transcript)}</p><div class="tools">${favoriteControl(item,'认可答案',true)}${button('回到这题作答修改','return-answer-'+item.id)}</div></section>`).join('')}`
}
function reportAnswerDialog(){
  const answer=snapshotAnswers().find(item=>item.id===reportAnswerId)
  if(!answer)return ''
  return `<dialog id="report-answer-dialog" aria-label="回答原文"><div class="row"><h2>${esc(reportAnswerName(answer.id))} · 回答原文</h2>${button('关闭原文','close-report-answer')}</div><p>${esc(answer.text)}</p><p class="muted">本次报告使用的答案快照 · 只读${stale?' · 当前答案已修改':''}</p><p class="answer-snapshot">${esc(answer.transcript)}</p><div class="action-footer">${favoriteControl(answer,'认可答案',true)}${button('回到这题作答修改','return-answer-'+answer.id,true)}${button('返回维度分析','close-report-answer')}</div></dialog>`
}
function audioReview() {
  if (confirmed && reportKind === '录音') return report.length ? reportPage() : coverage()
  return `${heading('真实面试录音复盘', '导入整段录音，回听并确认问答稿。')}
  <section class="panel">${profilePicker()}<p class="muted">确认文字稿时，将绑定当前选择的简历与岗位。</p><label for="jd">本场岗位描述（JD，选填）</label><textarea id="jd" placeholder="供本场岗位匹配评估参考">${esc(jd)}</textarea><label for="file-audio">上传录音文件</label><input id="file-audio" type="file" accept="audio/*">
  <div class="tools">${originalAudio ? button('转写并划分问答', 'transcribe-file', true) : ''}${button('新增文字段落', 'add-segment')}${'<button class="text-action" data-action="sample-transcript">试用示例文字稿</button>'}</div>
  ${originalName ? `<p class="muted">${esc(originalName)}</p>${player(originalAudio)}` : ''}</section>
  <p class="muted">历史模拟面试与录音报告统一保存在「面试记录」。</p>
  ${segments.length ? `<section class="panel"><div class="row"><h2>问答文字稿</h2><span class="badge">需人工确认</span></div>
  ${segments.map((item, i) => `<div class="question"><div class="row"><button data-action="seek-${i}">${formatTime(item.time)} · 定位片段</button><label for="role-${i}">说话人${item.speaker ? " · " + esc(item.speaker) : ""}</label></div>
  <select id="role-${i}" data-role="${i}">${['面试官', '候选人', '不确定'].map(role => `<option ${item.role === role ? 'selected' : ''}>${role}</option>`).join('')}</select>
  <label for="time-${i}">片段开始时间（秒）</label><input id="time-${i}" type="number" min="0" data-time="${i}" value="${item.time}"><label for="segment-${i}">第 ${i + 1} 段文字</label><textarea id="segment-${i}" data-segment="${i}">${esc(item.text)}</textarea><div class="tools">${button('删除段落', 'segmentdrop-' + i)}${button('合并到上一段', 'segmentmerge-' + i, false, i === 0)}</div></div>`).join('')}
  ${button('确认文字稿，检查评分维度', 'confirm-transcript', true)}</section>` : ''}`
}
function resumeLibrary() {
  const item = resumes[resumeIndex]
  return `${heading('简历资料库', '每份简历绑定目标岗位，开练时选择一组资料。')}
  <section class="panel"><h2>我的简历</h2>
  ${resumes.map((entry, i) => `<div class="question row"><strong>${esc(entry.name)} · ${esc(entry.role || "待补充岗位")}</strong>${button('编辑', 'resume-' + i)}</div>`).join('') || '<p class="muted">还没有简历。</p>'}
  ${button('新增简历', 'resume-new')}</section>
  ${item ? `<section class="panel"><label for="resume-title">简历名称（必填）</label><input required id="resume-title" value="${esc(item.name)}"><label for="resume-role">目标岗位（必填）</label><input required id="resume-role" value="${esc(item.role || '')}" placeholder="例如：大模型产品经理"><label for="resume-file">上传简历文件（选填）</label><input id="resume-file" type="file" accept=".pdf,.docx,.txt,.md">${item.file ? `<a href="${mediaUrl(item.file)}" target="_blank" rel="noopener">查看原文件 ↗</a>` : ''}
  <label for="resume-text">简历正文（必填，可编辑）</label><textarea required id="resume-text" placeholder="可直接粘贴简历内容">${esc(item.text)}</textarea>
  <p class="muted">资料自动保存。支持 PDF、DOCX、TXT、MD，也可以直接粘贴简历正文。</p>${button('完成', 'resume-done', true)}</section>` : ''}`
}
function apiKeyLink(provider: string) {
  const miniMax = providers.region === 'global'
    ? { name: 'MiniMax 国际站', url: 'https://platform.minimax.io/user-center/basic-information/interface-key' }
    : { name: 'MiniMax 中国站', url: 'https://platform.minimax.cn/console/keys' }
  const links: Record<string, {name: string; url: string}> = {
    kimi: { name: 'Kimi', url: 'https://platform.kimi.com/console/api-keys' },
    openai: { name: 'OpenAI', url: 'https://platform.openai.com/api-keys' },
    minimax: miniMax,
    dashscope: { name: '阿里云百炼', url: 'https://bailian.console.aliyun.com/?tab=model#/api-key' },
  }
  const item = links[provider]
  return item ? `<p class="muted"><a href="${item.url}" target="_blank" rel="noopener noreferrer">获取 ${item.name} API Key ↗</a> · 创建后复制到对应输入框并保存。</p>` : ''
}
function miniMaxSiteField() {
  return `<label for="model-region">MiniMax 服务站点</label><select id="model-region"><option value="cn" ${providers.region==='cn'?'selected':''}>中国站 · api.minimax.cn</option><option value="global" ${providers.region==='global'?'selected':''}>国际站 · api.minimax.io</option></select>`
}
function settings() {
  return `${heading('模型设置','分别配置对话与图片、语音转写服务。已保存密钥不代表测试成功。')}
  <section class="panel"><h2>对话与图片</h2>
  <p id="config-unsaved" class="hint warn" role="status"></p><p id="dialogue-save-status" class="muted"></p><label for="provider">对话与图片服务商</label><select id="provider">${[['kimi','Kimi'],['minimax','MiniMax'],['openai','OpenAI'],['dashscope','阿里云百炼']].map(([id,name])=>`<option value="${id}" ${providers.provider===id?'selected':''}>${name}</option>`).join('')}</select>
  ${providers.provider==='minimax'?miniMaxSiteField():''}<label for="dialogue">模型 ID（必填）</label><input id="dialogue" required value="${esc(providers.dialogue)}"><p class="muted">填写接口识别的模型 ID，例如 ${providers.provider==='kimi'?'kimi-k3.1-pro':providers.provider==='minimax'?'MiniMax-M3.1-Flash':providers.provider==='openai'?'gpt-4o':'qwen4-max'}；支持自定义。</p>
  <label for="dialogue-key">${providers.provider==='kimi'?'Kimi':providers.provider==='minimax'?'MiniMax':providers.provider==='openai'?'OpenAI':'阿里云百炼'} API Key</label><input id="dialogue-key" type="password" placeholder="${modelConfigured?'已保存密钥，留空保留':'输入 API Key'}" autocomplete="new-password">${apiKeyLink(providers.provider)}
  <div class="action-footer">${button(connectionTesting?'正在测试…':'保存并测试对话与图片','test-model',true)}${button('保存对话配置','save-dialogue')}</div>
  <div id="model-test-result" role="status" aria-live="polite">${connectionResult?`<p class="hint">${esc(connectionResult)}</p>`:''}</div></section>
  <section class="panel"><h2>语音转写</h2><p id="speech-save-status" class="muted"></p><label for="speech">语音转写模型</label><select id="speech"><option value="asr-1.0" ${providers.speech==='asr-1.0'?'selected':''}>MiniMax · asr-1.0</option><option value="paraformer-realtime-v2" ${providers.speech!=='asr-1.0'?'selected':''}>阿里云 · paraformer-realtime-v2</option></select>
  ${providers.speech==='asr-1.0'?`<label for="speech-region">语音服务站点</label><select id="speech-region"><option value="cn" ${providers.speechRegion==='cn'?'selected':''}>中国站 · api.minimax.cn</option><option value="global" ${providers.speechRegion==='global'?'selected':''}>国际站 · api.minimax.io</option></select>`:''}
  ${(providers.provider==='minimax'&&providers.speech==='asr-1.0'&&providers.region===providers.speechRegion)||(providers.provider==='dashscope'&&providers.speech!=='asr-1.0')?`<label><input id="shared" type="checkbox" ${providers.shared?'checked':''}> 转写复用对话服务 API Key</label>`:''}
  ${providers.shared?'':`<label for="speech-key">${providers.speech==='asr-1.0'?'MiniMax':'阿里云百炼'} 语音 API Key</label><input id="speech-key" type="password" placeholder="${speechConfigured?'已保存密钥，留空保留':'输入 API Key'}" autocomplete="new-password">`}${apiKeyLink(providers.speech==='asr-1.0'?'minimax':'dashscope')}
  <label for="speech-test-file">测试录音（测试转写时必选）</label><input id="speech-test-file" type="file" accept="audio/*">${speechTestFile?`<p>已选择：${esc(speechTestFile.name)}</p>`:''}
  <div class="action-footer">${button(speechTesting?'正在测试转写…':'保存并测试转写','test-speech',true)}${button('保存语音配置','save-speech')}</div>
  <div id="speech-test-result" role="status" aria-live="polite">${speechTestResult?`<p class="hint">${esc(speechTestResult)}</p>`:''}</div></section>`
}
function accounts() {
  return `${heading('账户与邀请', '每位用户访问自己的练习、录音和模型配置。')}
  <section class="panel"><h2>${isAdmin ? '邀请管理' : '我的账户'}</h2>
  ${accountEnabled ? `<a href="/account?next=/workspace">${isAdmin ? '打开邀请与账户管理' : '打开账户设置'} ↗</a>` : '<p>当前运行在本机模式。设置管理员凭据并重新启动可开启邀请模式。</p>'}</section>`
}
function coachingQuestion() { return page==='练习'&&stage==='练习'&&!goalReview?questions[active]:undefined }
function coachingPanel(item:Question) {
  loadCoaching(item)
  const referenceKey=practiceSessionId+':'+item.id+':reference',coachKey=practiceSessionId+':'+item.id+':coach'
  return `<h2>需要帮助？</h2><p class="muted">重答只在上方作答区进行，下面两项辅助按需打开。</p>
  <details data-reference="${item.id}" ${referenceOpenIds.has(item.id)?'open':''}><summary>查看参考答案（AI 辅助）</summary>${item.reference?`${!hasCompleteSentenceEnd(item.reference)?'<p class="hint warn" role="status">当前保存的参考答案可能未写完，请重新生成。你的作答不会被替换。</p>':''}<div class="hint reference-text">${esc(item.reference)}</div><div class="tools">${favoriteControl(item,'AI参考答案')}</div>`:''}${button(pendingHelp.has(referenceKey)?'正在生成参考答案…':item.reference?'重新生成参考答案':'生成参考答案','reference',false,pendingHelp.has(referenceKey))}${helpErrors.has(referenceKey)?failureCard('参考答案',helpErrors.get(referenceKey)!,'reference'):''}</details>
  <details ${guidance?'open':''}><summary>获取改进思路</summary><label for="concern">希望改进的地方</label><textarea id="concern" placeholder="例如：没有说明方案取舍的依据">${esc(concern)}</textarea><p class="muted">根据你填写的改进点单轮回复，不代写答案。</p>${button(pendingHelp.has(coachKey)?'正在生成思路…':'生成重答框架','coach',false,pendingHelp.has(coachKey))}${guidance?`<div class="hint reference-text">${esc(guidance)}</div>`:''}${helpErrors.has(coachKey)?failureCard('改进思路',helpErrors.get(coachKey)!,'coach'):''}</details>`
}
async function requestHelp(task:'reference'|'coach'){
  const item=coachingQuestion();if(!item)return
  if(task==='coach'&&!concern.trim())return fieldError('concern','请先填写希望改进的地方。')
  if(!practiceSessionId){archiveCurrentReport()}
  const owner=practiceSessionId,key=owner+':'+item.id+':'+task
  if(pendingHelp.has(key))return
  const input={question:item.text,answer:{id:item.id,transcript:item.transcript},concern,jd,...profileContext()}
  pendingHelp.add(key);helpErrors.delete(key);render()
  try{
    const result=await ai<{answer?:string;guidance?:string;generation?:Question['referenceGeneration']}>(task,input)
    const text=(task==='reference'?result.answer:result.guidance)?.trim()
    if(!text)throw new Error('模型没有返回有效内容，请重试。')
    const current=owner===practiceSessionId?questions.find(q=>q.id===item.id):archives.find(entry=>entry.sessionId===owner)?.questions.find(q=>q.id===item.id)
    if(!current)return
    const archived=archives.find(entry=>entry.sessionId===owner);if(archived)archived.updatedAt=new Date().toISOString()
    if(task==='reference'){current.reference=text;current.referenceGeneration=result.generation;referenceOpenIds.add(current.id)}
    else{current.coachingDraft={concern:input.concern,guidance:text,draft:current.coachingDraft?.draft || '',audio:current.coachingDraft?.audio || '',editing:true};if(owner===practiceSessionId&&coachingOwner===item.id){guidance=text;editingAnswer=true}}
  }catch(error){helpErrors.set(key,(error as Error).message)}
  finally{pendingHelp.delete(key);queueSave();if(!recorder&&!acquiring)render()}
}
function sidePanel() {
  if ((page==='练习'&&stage==='报告')||(page==='录音复盘'&&confirmed&&report.length)) return '<h2>报告说明</h2><p>本页只审查回答，修改请返回作答。点击维度切换分析，不重复调用模型。</p>'
  if (page === '练习' && stage === '练习') {
    const item = questions[active]
    if (toolTab === '重答辅导') return coachingPanel(item)
    if (toolTab === '本场题单') return questionDirectory()
    return `<h2>主动追问</h2><span class="context">${esc(label(item))}</span><p class="muted">根据当前作答生成一道追问。</p>
    ${button(generatingFollowup ? '正在生成追问…' : '生成一道追问', 'followup', false, generatingFollowup || Boolean(recorder) || acquiring)}
    ${generatingFollowup ? '<p class="hint" role="status">正在根据本题回答生成追问，请稍候。</p>' : followupError ? failureCard('生成追问',followupError,'followup') : item.pending ? '<p class="muted">语音正在转写，也可以先输入作答文字。</p>' : !item.transcript.trim() ? '<p class="muted">请先录音并完成转写，或输入本题作答文字。</p>' : ''}
    `
  }
  if (page === '练习') {
    return `<h2>本场练习</h2><span class="context">${esc(tab)}${practiceProfile ? ' · ' + esc(practiceProfile.name) + ' · ' + esc(practiceProfile.role) : ''}</span><p>题目按确认后的顺序展示。自己控制录音和追问，完成后查看整场六维报告。</p>
    `
  }
  if (page === '录音复盘') return '<h2>核对问答来源</h2><p>上传录音后可定位、回听并更正人物和文字。转写和说话人标注需要人工确认。</p>'
  if (page === '我的收藏') return '<h2>收藏说明</h2><p>仅当前账户可访问。收藏的是当时的内容快照，不会影响本场作答或评分。</p>'
  if (page === '简历库') return '<h2>使用简历</h2><p>准备题单时可选择一份简历，为出题、追问和重答提供背景。</p>'
  if (page === '模型设置') return '<h2>调用归属</h2><p>每位用户配置自己的模型，由用户承担调用费用。</p><p class="muted">已保存的密钥不会回显。</p>'
  return '<h2>权限范围</h2><p>管理员管理账户和邀请。用户仅可访问自己的资料和练习。</p>'
}
function questionDirectory() {
  return `<h2>本场题单</h2><div class="list">${questions.map((item,index)=>button(label(item)+' · '+esc(item.text.length>45?item.text.slice(0,45)+'…':item.text),'go-'+index,index===active,Boolean(recorder)||acquiring)).join('')}</div>`
}
function historyPage() {
  const profileKey=(profile:PracticeProfile)=>profile.id+'::'+profile.role
  const all=[...archives,...recordingArchives]
  const options=[...new Map(all.filter(item=>item.profile).map(item=>[profileKey(item.profile!),item.profile!])).values()]
  const accepts=(profile?:PracticeProfile)=>!historyFilter || Boolean(profile && profileKey(profile)===historyFilter)
  const practiceCards=archives.filter(item=>accepts(item.profile)).map(item=>`<section class="panel"><span class="badge">模拟面试</span><h2>${esc(item.title)}</h2><p>${esc(item.profile?.name || '未绑定资料')} · ${esc(item.profile?.role || '')}</p><p>${item.createdAt?new Date(item.createdAt).toLocaleString('zh-CN'):'早期记录'} · 已答 ${item.questions.filter(q=>q.transcript.trim()).length}/${item.questions.length} · ${!item.report.length?'进行中':item.stale?'待重评':'已出报告'}</p>${button(item.report.length?'打开报告':'继续练习','archive-'+(item.sessionId || archives.indexOf(item)))}</section>`)
  const recordingCards=recordingArchives.filter(item=>accepts(item.profile)).map(item=>`<section class="panel"><span class="badge">录音复盘</span><h2>${esc(item.title)}</h2><p>${esc(item.profile?.name || '未绑定资料')} · ${esc(item.profile?.role || '')}</p><p>${item.createdAt?new Date(item.createdAt).toLocaleString('zh-CN'):'早期记录'} · ${item.report.length?'已出报告':'文字稿待确认'}</p>${button(item.report.length?'打开录音报告':'继续录音复盘','recording-'+(item.id || recordingArchives.indexOf(item)))}</section>`)
  return `${heading('面试记录','草稿、进行中的面试和已生成报告统一保存，按最近保存时间排序。')}
  <label for="history-filter">筛选简历与岗位</label><select id="history-filter"><option value="">全部资料</option>${options.map(item=>`<option value="${esc(profileKey(item))}" ${historyFilter===profileKey(item)?'selected':''}>${esc(item.name)} · ${esc(item.role)}</option>`).join('')}</select>
  ${[...practiceCards.map((html,index)=>({html,time:archives.filter(item=>accepts(item.profile))[index].updatedAt || archives.filter(item=>accepts(item.profile))[index].createdAt || ''})),...recordingCards.map((html,index)=>({html,time:recordingArchives.filter(item=>accepts(item.profile))[index].updatedAt || recordingArchives.filter(item=>accepts(item.profile))[index].createdAt || ''}))].sort((a,b)=>b.time.localeCompare(a.time)).map(item=>item.html).join('') || '<p>暂无符合条件的记录。选择目标并输入材料后，草稿将自动保存到这里。</p>'}`
}
const flowSteps=['目标','导入','确认','练习','覆盖','报告'] as const
type FlowStep=typeof flowSteps[number]
const stepNames={目标:'目标',导入:'材料',确认:'核对题目',练习:'作答',覆盖:'评分前检查',报告:'报告'}
function stepReason(step:FlowStep) {
  if(recorder||acquiring)return '请先完成或停止录音。'
  if(working||navigating)return '正在处理，请稍候。'
  if(step==='目标')return ''
  if(!goalConfirmed||!practiceProfile)return '请先确认本场简历与目标岗位。'
  if(step==='导入')return ''
  if(!questions.length)return '请先导入或生成面试题。'
  if(step==='确认')return ''
  if(step==='报告'&&report.length)return ''
  const invalid=questions.findIndex(q=>!q.text.trim()||q.text.length>500)
  if(invalid>=0)return `请先核对第 ${invalid+1} 题，题目不能为空且最多500字。`
  if(!questionsConfirmed)return '请先核对题目并确认开始练习。'
  if(step==='练习')return ''
  if(step==='覆盖'){if(questions.some(q=>q.transcriptCandidate!==undefined))return '请先核对并确认机器转写，或放弃本次转写。';if(questions.some(q=>q.pending))return '正在转写，请稍候。';return questions.some(q=>q.transcript.trim()||q.audio)?'':'请先填写或录制至少一道回答。'}
  return report.length?'':'尚未生成报告，请先完成评分前检查。'
}
function stepNavigation(){
  const current=goalReview||(!goalConfirmed&&stage==='导入')?'目标':stage
  return `<nav class="steps flow-nav" aria-label="练习步骤导航">${flowSteps.map((step,index)=>{
    const reason=stepReason(step)
    const complete=step==='目标'?goalConfirmed:step==='导入'?Boolean(questions.length):step==='确认'?questionsConfirmed:step==='练习'?Boolean(report.length)||questions.every(q=>Boolean(q.transcript.trim())):step==='覆盖'?missing!==null:Boolean(report.length)
    return `<span class="flow-step"><button data-action="step-${step}" ${reason?'disabled':''} ${current===step?'aria-current="step"':''} aria-describedby="step-help-${index}" title="${esc(reason||'查看'+stepNames[step])}"><span aria-hidden="true">${complete&&current!==step?'✓':index+1}.</span> ${stepNames[step]}</button><span id="step-help-${index}" class="step-help">${esc(reason)}</span></span>`
  }).join('')}</nav><p class="flow-condition muted" role="status">${esc((['导入','确认','练习','覆盖','报告'] as FlowStep[]).map(step=>stepReason(step)).find(reason=>reason && reason!=='正在处理，请稍候。') || '已解锁的步骤可直接查看；切换前自动保存。')}</p>`
}
async function navigateStep(step:FlowStep) {
  const reason=stepReason(step);if(reason)return flash(reason)
  navigating=true;approvedQuestionEdits.clear();render()
  try{
    if(!await save())return flash('保存未成功，请处理保存问题后再切换步骤。')
    resetCoaching();reviewAll=false;reportAnswerId=undefined
    goalReview=step==='目标'
    if(step!=='目标')stage=step
    if(step==='报告')reportDetailTab='analysis'
    queueSave();await save()
  }finally{navigating=false;render();content.querySelector('h1')?.focus()}
}
function goalSnapshotView(){
  if(!practiceProfile)return goalSetup()
  return `${heading('本场简历与目标岗位','查看已确认的本场资料。更换目标将新建练习，不会修改旧报告。')}${profileNotice(false)}<section class="panel"><h2>${esc(practiceProfile.name)}</h2><p>目标岗位：${esc(practiceProfile.role)}</p><details><summary>查看本场简历正文</summary><p class="answer-snapshot">${esc(practiceProfile.text)}</p></details><div class="action-footer">${button('更换目标并新建练习','new-target')}${button('继续本场作答','step-练习',true,Boolean(stepReason('练习')))}</div></section>`
}
function archivePracticeBeforeReset(){stashCoaching();archiveCurrentReport()}
async function leaveReportForAnswer(id?:number){
  if(recorder||acquiring||working)return flash('请先完成当前操作。')
  if(!await save())return flash('保存未成功，暂不能返回作答。')
  reviewAll=false;reportAnswerId=undefined;goalReview=false;resetCoaching()
  if(reportKind==='练习'){
    page='练习';stage='练习';questionsConfirmed=true
    if(id!==undefined){const index=questions.findIndex(q=>q.id===id);if(index<0)return flash('该题已移除，请从当前题单选择。');active=index}
    toolTab='主动追问'
  }else{page='录音复盘';confirmed=false}
  queueSave();render()
  const field=reportKind==='练习'?'#answer-text':id!==undefined?'#segment-'+(-id-1):'#segment-0'
  content.querySelector<HTMLElement>(field)?.focus()
}
function render() {
  if(tab==='小红书链接'){tab='手动输入';manualMode='参考资料';importFailure=''}
  updateReportValidity()
  stopReading()
  const pageIcons = ['◉', '▤', '☆', '↻', '▤', '⚙', '♙']
  nav.innerHTML = pages.map((name, i) => `<button data-action="page-${name}" ${page === name ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${pageIcons[i]}</span>${name==='练习'?'模拟面试':name==='练习记录'?'面试记录':name}</button>`).join('')
  const views = { 导入: setup, 确认: confirmQuestions, 练习: practice, 覆盖: coverage, 报告: reportPage }
  content.innerHTML = page === '练习' ? `${stepNavigation()}${goalReview?goalSnapshotView():views[stage]()}`
    : page === '我的收藏' ? favoritesPage() : page === '练习记录' ? historyPage() : page === '录音复盘' ? audioReview() : page === '简历库' ? resumeLibrary() : page === '模型设置' ? settings() : accounts()
  const contextual = page === '练习' && stage==='练习' && !goalReview
  if (contextual) content.insertAdjacentHTML('beforeend', `<section class="panel contextual">${stage==='练习'?`<div class="tabs" role="tablist" aria-label="本题工具">${['重答辅导','主动追问','本场题单'].map(name=>`<button role="tab" id="tool-${name}" aria-controls="tool-panel" tabindex="${toolTab===name?0:-1}" aria-selected="${toolTab===name}" data-action="tool-${name}">${name}</button>`).join('')}</div>`:''}<div ${stage==='练习'?`role="tabpanel" id="tool-panel" aria-labelledby="tool-${toolTab}"`: ''}>${sidePanel()}</div></section>`)

  document.querySelector('.shell')?.classList.toggle('report-view',(page==='练习'&&stage==='报告'&&!goalReview)||(page==='录音复盘'&&confirmed&&Boolean(report.length)))
  if(reportAnswerId!==undefined){content.insertAdjacentHTML('beforeend',reportAnswerDialog());content.querySelector<HTMLDialogElement>('#report-answer-dialog')?.showModal()}
  assistant.innerHTML = contextual ? '<h2>操作提示</h2><p>在作答下方切换重答辅导、主动追问和本场题单。</p>' : sidePanel()
  content.insertAdjacentHTML('afterbegin', `<div class="savebar"><span id="save-status" role="status">${esc(saveStatus)}</span><div id="save-recovery" ${blocked || saveStatus.startsWith('保存失败') ? '' : 'hidden'}>${button('重试保存', 'retry-save')}${button('下载本地草稿', 'export-draft')}${button('刷新并加载最新', 'reload')}</div></div>${operationPanel()}`)
  if (working) {
    content.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.disabled = true)
    content.querySelectorAll<HTMLInputElement>('input,textarea,select').forEach(field => field.disabled = true)
  }
  if (undoAction) content.insertAdjacentHTML('afterbegin',`<div class="undo-bar" role="status">${esc(undoLabel)} ${button('撤销','undo')}</div>`)
  if (page==='模型设置') {
    const modelInput=content.querySelector<HTMLInputElement>('#dialogue-key')
    if(modelInput) modelInput.value=modelKeyDrafts.get(modelKeyScope()) || ''
    const speechInput=content.querySelector<HTMLInputElement>('#speech-key')
    if(speechInput) speechInput.value=speechKeyDrafts.get(speechKeyScope()) || ''
  }
  if(page===operationOrigin && operationAction && !['test-model','test-speech','followup'].includes(operationAction)) {
    const actionButton=content.querySelector<HTMLButtonElement>(`[data-action="${operationAction}"]`)
    const message=operationMessage || (!reportError&&!followupError?operationError:'')
    if(actionButton && message) (actionButton.closest('.action-footer,.tools') || actionButton).insertAdjacentHTML('afterend',operationError?failureCard('当前操作',message,operationAction):`<p class="hint" role="status">${esc(message)}</p>`)
  }
  updateConfigurationStatus()
  markFieldErrors()
  if(Object.keys(fieldErrors).length) content.querySelector<HTMLElement>('[aria-invalid=true]')?.focus()
  updateSaveStatus()
}
async function startTranscription(item: Question) {
  if (!item.audio || item.pending) return
  archiveCurrentReport()
  const owner=practiceSessionId
  item.pending = true
  item.failed = false
  const prior = item.transcript
  const source = item.audio
  render()
  try {
    const result = await remote<{segments: Segment[]}>('/transcribe', 'POST', { id: mediaId(source) })
    const text=result.segments.map(segment=>segment.text).join(' ').trim()
    if(!text)throw new Error('未识别到可用语音。请回听或更换录音设备。')
    if(item.audio===source&&item.transcript===prior)item.transcriptCandidate=text
    item.transcriptionError=undefined
    if (reportKind === '练习') {
      if (stage === '覆盖') missing = null
      if (stage === '报告') stale = true
    } else {
      const practiceReport = savedReports.get('练习')
      if (practiceReport && stage === '覆盖') practiceReport.missing = null
      if (practiceReport && stage === '报告') practiceReport.stale = true
    }
  } catch (error) {
    item.failed = true
    item.transcriptionError=(error as Error).message
    flash(item.transcriptionError)
  } finally {
    item.pending = false
    const archived=archives.find(entry=>entry.sessionId===owner)
    const targets=[...(owner===practiceSessionId?questions:[]),...(archived?.questions || [])].filter(q=>q.id===item.id&&q!==item&&q.audio===source)
    for(const target of targets){target.pending=false;target.failed=item.failed;target.transcriptionError=item.transcriptionError;if(target.transcript===prior&&item.transcriptCandidate!==undefined)target.transcriptCandidate=item.transcriptCandidate}
    if(archived)archived.updatedAt=new Date().toISOString()
    queueSave()
    if (!recorder && !acquiring) render()
  }
}
async function prepareMicrophones(){
  try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(track=>track.stop());microphones=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput');render()}catch{micWarning='无法访问麦克风，请检查浏览器权限。';render()}
}
async function record(target: string) {
  if (recorder || acquiring) return
  stopReading()
  acquiring = true
  recordingMessage = '正在等待麦克风权限'
  recordTarget = target
  const item = questions[active]
  render()
  let stream: MediaStream | undefined
  try {
    stream = await navigator.mediaDevices.getUserMedia({audio:selectedMicrophone?{deviceId:{exact:selectedMicrophone}}:true})
    microphones=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput')
    micWarning='';lastSoundAt=Date.now();silentTicks=0;totalAudioTicks=0
    let recordingFinished=false
    const audioTrack=stream.getAudioTracks()[0]
    const warn=(message:string)=>{micWarning=message;const node=document.getElementById('mic-warning');if(node)node.textContent=message;const visible=document.getElementById('recording-warning');if(visible)visible.textContent=message}
    audioTrack.addEventListener('mute',()=>{if(!recordingFinished)warn('麦克风输入已中断或被静音，请检查设备。')})
    audioTrack.addEventListener('unmute',()=>{if(!recordingFinished)warn('麦克风输入已恢复，请确认录音内容完整。')})
    audioTrack.addEventListener('ended',()=>{if(!recordingFinished)warn('麦克风设备已断开，请停止并检查录音。')})
    const chunks: Blob[] = []
    const capture = new MediaRecorder(stream)
    recorder = capture
    recordingStarted = Date.now()
    try {
      audioContext = new AudioContext()
      await audioContext.resume()
      analyser = audioContext.createAnalyser()
      audioContext.createMediaStreamSource(stream).connect(analyser)
    } catch { analyser = undefined }
    recordingTick = setInterval(() => {
      const time = document.querySelector('#recording-time')
      if (time) time.textContent = formatTime(Math.floor((Date.now() - recordingStarted) / 1000))
      if (analyser) {
        const values = new Uint8Array(analyser.fftSize)
        analyser.getByteTimeDomainData(values)
        const level = document.querySelector<HTMLMeterElement>('#input-level')
        const volume=Math.sqrt(values.reduce((sum,value)=>sum+((value-128)/128)**2,0)/values.length)
        totalAudioTicks++;if(volume<.01)silentTicks++;else lastSoundAt=Date.now()
        if(level)level.value=Math.min(1,volume*4)
        if(Date.now()-lastSoundAt>5000)warn('连续5秒未检测到有效输入音量，请检查麦克风或回听。此提示不代表识别了人声。')
      }
    }, 250)
    capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    capture.onstop = async () => {
      recordingFinished=true
      clearInterval(recordingTick)
      void audioContext?.close()
      analyser = undefined
      stream?.getTracks().forEach(track => track.stop())
      recorder = null
      if (chunks.length) {
        const blob = new Blob(chunks, { type: capture.mimeType || chunks[0].type })
        if(target==='mic-test'){if(microphonePreview)URL.revokeObjectURL(microphonePreview);microphonePreview=URL.createObjectURL(blob);acquiring=false;render();return}
        acquiring = true
        recordingMessage = '正在上传原声…'
        render()
        try {
          const old = target === 'draft' ? draftAudio : item.audio
          const url = await upload(blob, '录音')
          if (target === 'draft') {
            draftAudio = url
            recordingMessage = '原声已保存，正在转写重答…'
            render()
            const result = await remote<{segments: Segment[]}>('/transcribe', 'POST', { id: mediaId(url) })
            draft = result.segments.map(segment => segment.text).join(' ')
            draftNeedsReview=true
            flash('重答原声已保存，请核对文字后采用。')
          } else {
            item.audio = url
            const saved = await save()
            if (!saved) return
            item.audioWarning=totalAudioTicks>40&&silentTicks/totalAudioTicks>.9?'录音绝大部分时间输入音量很低，请先回听；未自动转写。':undefined
            if(!item.audioWarning)void startTranscription(item)
          }
          if (old) void remote('/media/' + mediaId(old), 'DELETE').catch(() => undefined)
        } catch (error) {
          flash((error as Error).message)
        } finally {
          acquiring = false
        }
      }
      render()
    }
    capture.start()
  } catch {
    stream?.getTracks().forEach(track => track.stop())
    recorder = null
    flash('无法使用麦克风。请检查浏览器权限，也可以输入文字。')
  } finally {
    acquiring = false
    render()
  }
}
function archiveRecording() {
  if (!originalAudio && !segments.some(item=>item.text.trim())) return
  archiveCurrentReport()
  originalAudio=''; originalName=''; segments=[]; report=[]; reportSnapshot=undefined; stale=false;confirmed=false; practiceProfile=undefined; recordingId=''; recordingCreatedAt=''; selectedResume=-1; missing=null; skipped.clear()
}

function loadTranscript() {
  segments = [
    { time: 0, role: '面试官', text: sample[0] },
    { time: 8, role: '候选人', text: sampleAnswers[0] },
    { time: 27, role: '面试官', text: sample[1] },
    { time: 35, role: '候选人', text: sampleAnswers[1] },
  ]
  confirmed = false
}
function move(list: unknown[], index: number, by: number) {
  if (index + by >= 0 && index + by < list.length) [list[index], list[index + by]] = [list[index + by], list[index]]
}
const savedReports = new Map<ReportKind, { reportSnapshot?:ReportSnapshot; jd?:string; profile?: PracticeProfile; rows: ScoreRow[]; stale: boolean; missing: number[] | null; skipped: number[] }>()
function useReport(kind: ReportKind) {
  savedReports.set(reportKind, { reportSnapshot,jd, profile: practiceProfile, rows: report, stale, missing, skipped: [...skipped] })
  const saved = savedReports.get(kind)
  reportKind = kind
  practiceProfile = saved?.profile
  jd=saved?.jd || ''
  report = saved?.rows ?? []
  reportSnapshot=saved?.reportSnapshot
  stale = saved?.stale ?? false
  missing = saved?.missing ?? null
  skipped = new Set(saved?.skipped ?? [])
  supplemental.clear()
  evidence = 0
  resetCoaching()
}
async function perform(operation: () => Promise<void>, message = '正在处理，请稍候。') {
  if (working) return
  working = true
  operationOrigin = page
  operationCompleted = false
  operationError = ''
  const action = (document.activeElement as HTMLElement | null)?.dataset.action || lastAction
  operationAction=action || ''
  const messages: Record<string, string> = {
    prepare: '正在读取参考资料并生成题单…', 'test-model': '正在依次测试对话和图片服务…',
    'save-settings': '正在保存模型设置…', 'transcribe-file': '正在转写录音并整理问答…', coach: '正在生成重答框架…',
  }
  operationMessage = reportBusy || (generatingFollowup ? '正在生成追问…' : messages[action || ''] || message)
  render()
  content.setAttribute('aria-busy', 'true')
  try { await operation(); await save() }
  catch (error) { operationError = (error as Error).message; flash(operationError) }
  finally { working = false; operationMessage = ''; operationCompleted = !operationError; content.removeAttribute('aria-busy'); queueSave(); render() }
}

document.addEventListener('click', event => {
  const target = (event.target as Element).closest<HTMLButtonElement>('button[data-action]')
  if (!target || target.disabled) return
  if (working) {
    const destination = target.dataset.action?.replace('page-', '') as Page
    if (['简历库', '模型设置', '账户与邀请', '练习记录', '我的收藏', operationOrigin].includes(destination)) { page = destination; render() }
    return
  }
  const action = target.dataset.action!
  lastAction=action
  fieldErrors = {}
  if (action==='undo') { const undo=undoAction; undoAction=undefined; undoLabel=''; undo?.(); queueSave(); render(); return }
  undoAction=undefined; undoLabel='' 
  if(action.startsWith('step-'))return void navigateStep(action.slice(5) as FlowStep)
  if(action.startsWith('report-tab-')){reportDetailTab=action.slice(11);render();return}
  if(action.startsWith('report-answer-')){reportAnswerId=Number(action.slice(14));render();return}
  if(action==='close-report-answer'){reportAnswerId=undefined;render();return}
  if(action==='return-answers')return void leaveReportForAnswer()
  if(action.startsWith('return-answer-'))return void leaveReportForAnswer(Number(action.slice(14)))
  if(action.startsWith('retry-task-')){const original=action.slice(11);if(!content.querySelector(`[data-action="${original}"]`)){page=operationOrigin;render()}content.querySelector<HTMLButtonElement>(`[data-action="${original}"]`)?.click();return}
  if(action.startsWith('unfavorite-')){favorites=favorites.filter(entry=>entry.id!==action.slice(11));queueSave();render();return}
  if(action.startsWith('favorite-')){
    if(recorder||acquiring)return flash('请先停止录音。')
    const snapshot=action.startsWith('favorite-snapshot-')
    const item=snapshot?snapshotAnswers().find(answer=>answer.id===Number(action.slice(18))):questions[active]
    if(!item)return
    archiveCurrentReport()
    const candidate=favoriteCandidate(item,action==='favorite-reference'?'AI参考答案':'认可答案',snapshot)
    if(!candidate.answer.trim())return flash('请先准备好答案后再收藏。')
    const previous=matchingFavorite(candidate)
    if(previous)favorites=favorites.filter(entry=>entry.id!==previous.id)
    else favorites.unshift(structuredClone({...candidate,id:crypto.randomUUID(),createdAt:new Date().toISOString()}))
    queueSave();render();flash(previous?'已取消收藏':'已收藏内容快照');return
  }
  if (action === 'read-question') { readQuestion(); return }
  const [verb, rawIndex] = action.split('-')
  const i = Number(rawIndex)
  if ((recorder || acquiring) && action !== 'stop') return flash('请先完成或停止录音。')
  if (verb === 'record' && rawIndex !== 'review') { const target=action.slice(7);const old=target==='draft'?draftAudio:target==='mic-test'?undefined:questions[active]?.audio;if(old&&!window.confirm(target==='draft'?'重新录音会替换重答草稿的原声。是否继续？':'重新录音会替换本题当前原声。是否继续？'))return;return record(target)}
  if (action === 'stop') {
    if (recorder?.state === 'recording') recorder.stop()
    return
  }
  if (action === 'retry-save') { if (blocked) return flash('请下载本地草稿后加载最新版本。'); return void save() }
  if (action === 'export-draft') {
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 2)], {type:'application/json'}))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = '好好面-本地草稿.json'; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return
  }
  if (action === 'reload') { location.reload(); return }
  if (action === 'bind-profile') {
    if (!bindProfile()) return
    stale = Boolean(report.length)
    queueSave(); render(); return
  }
  if (action === 'operation-result') { page = operationOrigin; operationCompleted = false; render(); return }
  if (action === 'confirm-goal') { if (!bindProfile()) return; goalConfirmed=true; queueSave(); render(); return }
  if (action === 'change-goal') { if(startedAt||report.length){goalReview=true;render();return} goalConfirmed=false;goalReview=false; stage='导入'; queueSave(); render(); return }
  if (action === 'create-goal') { returnToGoal=true; page='简历库'; resumes.push({id:crypto.randomUUID(),name:'新简历',role:'',text:''}); resumeIndex=resumes.length-1; queueSave(); render(); return }
  if(action==='cancel-redraft'){editingAnswer=false;draft='';draftAudio='';draftNeedsReview=false;queueSave();render();return}
  if(action==='confirm-answer-transcript'||action==='confirm-answer-advance'){
    const item=questions[active]
    if(item.transcriptCandidate===undefined)return
    if(!item.transcriptCandidate.trim())return fieldError('answer-text','请填写核对后的答案，或放弃本次转写。')
    item.transcript=item.transcriptCandidate;delete item.transcriptCandidate;missing=null
    if(action==='confirm-answer-advance'){if(active<questions.length-1){resetCoaching();active++}else finishPractice()}
    queueSave();render();content.querySelector<HTMLElement>('h1')?.focus();return
  }
  if(action==='discard-answer-transcript'){delete questions[active].transcriptCandidate;queueSave();render();return}
  if(action==='microphones')return void prepareMicrophones()
  if (action === 'begin-redraft') { loadCoaching(questions[active]);editingAnswer=true; queueSave(); render(); content.querySelector('#draft')?.scrollIntoView({block:'center'}); return }
  if (verb === 'tool') { toolTab=rawIndex; queueSave(); render(); document.getElementById('tool-'+toolTab)?.focus(); return }
  if (verb === 'page') {
    stashCoaching();archiveCurrentReport()
    page = rawIndex as Page
    if (page === '练习' || page === '录音复盘') {
      const kind = page === '练习' ? '练习' : '录音'
      if (kind !== reportKind) useReport(kind)
    }
  } else if (verb === 'tab') { if(!['手动输入','截图','根据 JD 出题'].includes(rawIndex))return;tab = rawIndex; importFailure = '' }
  else if (action === 'prepare') {
    if(startedAt||report.length){if(!window.confirm('重新生成将为当前目标新建一场练习，原有作答和报告会保存在面试记录。是否继续？'))return;archivePracticeBeforeReset();report=[];reportSnapshot=undefined;startedAt='';practiceSessionId='';practiceCreatedAt='';questionsConfirmed=false;questions=[];stale=false}
    target.disabled = true
    target.textContent = '正在生成题单…'
    return void perform(prepare)
  }
  else if (action === 'manual-questions') {if(startedAt||report.length){if(!window.confirm('使用新的题目将新建本场目标下的练习，原作答保存在面试记录。是否继续？'))return;archivePracticeBeforeReset();report=[];reportSnapshot=undefined;startedAt='';practiceSessionId='';practiceCreatedAt='';questionsConfirmed=false;stale=false}return useManualQuestions()}
  else if (action === 'sample') {
    if ((raw.trim() || tab!=='手动输入') && !window.confirm('将切换为已有题目模式并替换输入的题目或参考资料，其他材料保留。是否继续？')) return
    manualMode='已有题目'
    tab = '手动输入'
    raw = sample.join('\n')
  } else if (action === 'back') stage = '导入'
  else if (action === 'add') { if (questions.length >= 30) return flash('题单最多 30 道主问题。'); questions.push(question('', '手动新增')) }
  else if (verb === 'up' || verb === 'down') move(questions, i, verb === 'up' ? -1 : 1)
  else if (verb === 'imremove') { const removed=screenshots.splice(i,1)[0]; offerUndo('已移除截图',()=>screenshots.splice(i,0,removed)) }
  else if (verb === 'imup' || verb === 'imdown') move(screenshots, i, verb === 'imup' ? -1 : 1)
  else if (verb === 'delete') {const item=questions[i];if((item.transcript||item.audio||report.length)&&!window.confirm('删除此题将移除该题及所属追问的当前作答，已有报告标记待重评；可立即撤销。是否删除？'))return;const before=structuredClone(questions);questions=questions.filter(q=>q.id!==item.id&&q.parentId!==item.id);offerUndo('已删除题目及所属追问',()=>{questions=before});if(report.length)stale=true;missing=null}
  else if (action === 'start') {
    if (!goalConfirmed || !practiceProfile) { stage = '导入'; goalConfirmed=false; render(); return flash('请先确认本场练习目标。') }
    if (!questions.length) return flash('请先添加一道面试题。')
    const invalid=questions.findIndex(item=>!item.text.trim() || item.text.length>500)
    if(invalid>=0) return fieldError('question-'+invalid,'请填写题目，每题最多 500 字。')
    questionsConfirmed=true;goalReview=false
    stage = '练习'
    startedAt ||= new Date().toISOString()
    active=Math.min(active,questions.length-1)
  } else if (verb === 'go') { if (active !== i) resetCoaching(); active = i; toolTab='主动追问'; queueSave(); render(); content.querySelector('h1')?.scrollIntoView({block:'start'}); return }
  else if (action === 'prev' || action === 'next') { resetCoaching(); active += action === 'prev' ? -1 : 1 }
  else if (action === 'followup') {
    const item = questions[active]
    followupError = ''
    if (!item.transcript.trim()) {
      followupError = item.pending ? '正在转写，请稍候或先输入本题作答文字，再生成追问。' : '请先填写本题答案，或录音并完成转写，再生成追问。'
      render()
      return
    }
    generatingFollowup = true
    render()
    return void perform(async () => {
      try {
        const result = await ai<{question: string}>('followup', { question: item.text, answer: item.transcript, priorQuestions: questions.map(q => q.text), jd, ...profileContext() })
        if (typeof result.question !== 'string' || !result.question.trim()) throw new Error('模型未返回追问，请重试。')
        if(result.question.trim().length>500) throw new Error('追问超过 500 字，请重新生成。')
        const parentId = item.parentId || item.id
        const followupNumber = Math.max(0, ...questions.filter(q => q.parentId === parentId).map(q => q.followupNumber || 0)) + 1
        const position = questions.findLastIndex(q => q.id === parentId || q.parentId === parentId) + 1
        questions.splice(position, 0, { ...question(result.question.trim(), '主动追问'), parentId, followupNumber })
        resetCoaching()
        active = position
      } catch (error) {
        followupError = (error as Error).message
        throw error
      } finally { generatingFollowup = false }
    })
  }
  else if (action === 'finish') {
    finishPractice()
  } else if (action === 'retry-answer') return void startTranscription(questions[active])
  else if (action === 'all-answers') reviewAll = true
  else if (action === 'report-return') { reviewAll = false; selectedAnswerId = undefined; resetCoaching() }
  else if (verb === 'optimize') { selectedAnswerId = questions[i].id; resetCoaching(); render(); content.querySelector('.contextual')?.scrollIntoView({block:'start'}); return }
  else if (action === 'practice') {goalReview=false;stage = '练习'}
  else if (action === 'score' || action === 'rescore') {
    reportError = ''
    reportBusy = '正在一次分析六个维度，未覆盖项自动按默认分计入，请稍候。'
    render()
    return void perform(async () => {
      try {
        skipped.clear();missing=null
        await makeScore()
        if (reportKind === '练习') { stage = '报告'; reviewAll = false }
      } catch (error) {
        reportError = (error as Error).message
        throw error
      } finally {
        reportBusy = ''
        render()
        if (page === operationOrigin) content.querySelector('h1')?.scrollIntoView({ block: 'start' })
      }
    })
  }
  else if (verb === 'evidence') {
    selectedAnswerId = undefined
    if (i !== evidence) resetCoaching()
    evidence = i
    reportDetailTab='analysis';reportAnswerId=undefined
    render()
    content.querySelector<HTMLElement>('#evidence')?.focus()
    return
  } else if (action === 'reference'||action==='coach') {return void requestHelp(action)}
  else if (action === 'adopt') {
    if (!draft.trim()) return fieldError('draft','请填写重答草稿，或先校对语音转写。')
    const previous = coachingQuestion()
    const item = questions.find(q => q.id === previous?.id)
    if (!item) return
    const old = item.audio
    item.audio = draftAudio || undefined
    item.transcript = draft.trim()
    delete item.transcriptCandidate;item.transcriptionError=undefined;draftNeedsReview=false
    draftAudio = ''
    stale = true
    missing = null
    resetCoaching()
    delete item.coachingDraft
    coachingOwner=undefined
    if (old) void save().then(saved => saved ? remote('/media/' + mediaId(old), 'DELETE') : undefined).catch(() => undefined)
    flash(report.length?'当前答案已替换，整场报告待重评。':'已采用并替换当前答案。')
  } else if (action === 'new'||action==='new-target') {
    if(action==='new-target'&&!window.confirm('将保存本场作答到面试记录，并新建练习选择另一份简历与岗位。是否继续？'))return
    archivePracticeBeforeReset()
    reportSnapshot=undefined;practiceSessionId='';practiceCreatedAt='';questionsConfirmed=false;goalReview=false;reportAnswerId=undefined;raw='';jd='';link='';screenshots=[]
    reportError = ''
    followupError = ''
    reviewAll = false
    selectedAnswerId = undefined
    if (report.length && questions.length && !archives.some(entry=>entry.createdAt===startedAt)) archives.unshift({ title: practiceName.trim() || questions[0].text, createdAt: startedAt || new Date().toISOString(), profile: practiceProfile, questions, report, stale, jd, skipped: [...skipped] })
    goalConfirmed = false
    practiceName = ''
    practiceProfile = undefined
    selectedResume = -1
    startedAt = ''
    questions = []
    report = []
    stale = false
    stage = '导入'
    missing = null
    resetCoaching()
  } else if (verb === 'archive') {
    reviewAll = false
    selectedAnswerId = undefined
    const stored = archives.find(entry=>entry.sessionId===action.slice(8)) || archives[i]
    if (!stored) return
    stashCoaching();archiveCurrentReport();resetCoaching()
    if(reportKind!=='练习') useReport('练习')
    const item=structuredClone(stored)
    ;({questions, report, jd, stale} = item)
    practiceProfile = item.profile
    reportSnapshot=item.reportSnapshot
    questionsConfirmed=true
    goalReview=false
    goalConfirmed = item.goalConfirmed ?? Boolean(item.profile)
    practiceName = item.title
    practiceSessionId=item.sessionId || '';practiceCreatedAt=item.createdAt || ''
    startedAt=item.startedAt ?? (item.report.length?item.createdAt || '':'')
    raw=item.raw || '';tab=item.tab || '手动输入';manualMode=item.manualMode || '已有题目';link=item.link || '';screenshots=item.screenshots || [];active=Math.min(item.active || 0,Math.max(0,item.questions.length-1))
    skipped = new Set(item.skipped)
    missing = [...skipped]
    stage = item.report.length?'报告':(item.draftStage || '练习')
    questionsConfirmed=item.questionsConfirmed ?? (item.report.length>0 || ['练习','覆盖','报告'].includes(item.draftStage || ''))
    page = '练习'
  } else if (action === 'sample-transcript') { if(segments.length&&!window.confirm('示例将替换当前文字稿，录音文件保留。是否继续？')) return; loadTranscript() }
  else if (action === 'add-segment') segments.push({ time: segments.at(-1)?.time ?? 0, role: '不确定', text: '' })
  else if (action === 'transcribe-file') return void perform(async () => {
    const asr = await remote<{segments: Segment[]}>('/transcribe', 'POST', { id: mediaId(originalAudio) })
    if (!asr.segments.length) throw new Error('未识别到可用语音。')
    segments = asr.segments.map(item => ({...item, role:'不确定'}))
    await save()
    if (!modelConfigured) return flash('已完成转写。可手动标注说话人，或配置对话模型后重试。')
    const result = await ai<{ segments: Segment[] }>('segments', asr.segments)
    if (!Array.isArray(result.segments) || !result.segments.length) throw new Error('未获得分段结果，可手动校对。')
    const cleaned = result.segments.filter(item => typeof item.text === 'string' && Number.isFinite(item.time) && item.time >= 0)
    if (cleaned.length) segments = cleaned.map(item => ({ time: item.time, text: item.text, speaker: asr.segments.find(source => source.time === item.time)?.speaker, role: ['候选人','面试官'].includes(item.role) ? item.role : '不确定' }))
  })
  else if (verb === 'seek') {
    const audio = content.querySelector('audio')
    if (!audio) return flash('请先上传要回听的录音。')
    const time = segments[i].time
    if (Number.isFinite(audio.duration) && time > audio.duration) return flash('此时间戳超出当前录音长度。')
    audio.currentTime = time
    audio.focus()
    return
  } else if (action === 'confirm-transcript') {
    if (!segments.some(segment => segment.role === '候选人' && segment.text.trim())) return fieldError('segment-0','请至少填写一段文字，并将说话人设为候选人。')
    if (!bindProfile()) return
    confirmed = true
    updateReportValidity()
    missing = null
    skipped.clear()
  } else if (action === 'record-review') confirmed = false
  else if (action === 'new-recording') archiveRecording()
  else if (verb === 'recording') {
    const archived = recordingArchives.find(entry=>entry.id===action.slice(10)) || recordingArchives[i]
    if (!archived) return
    stashCoaching();archiveCurrentReport();resetCoaching()
    if(reportKind!=='录音') useReport('录音')
    const copy=JSON.parse(JSON.stringify(archived)) as typeof archived
    practiceProfile = copy.profile
    reportSnapshot=copy.reportSnapshot
    jd=copy.jd || ''
    selectedResume=resumes.findIndex(item=>item.id===copy.profile?.id)
    originalAudio = copy.audio
    originalName = copy.title
    segments = copy.segments
    report = copy.report
    confirmed = copy.confirmed
    recordingId=copy.id || ''
    recordingCreatedAt=copy.createdAt || ''
    evidence = 0
    stale=copy.stale || false
    page='录音复盘'
  } else if (verb === 'segmentdrop') { const removed=segments.splice(i,1)[0]; offerUndo('已删除段落',()=>segments.splice(i,0,removed)) }
  else if (verb === 'segmentmerge' && i > 0) {
    const before=structuredClone(segments)
    offerUndo('已合并段落',()=>{segments=before})
    const current = segments[i]
    const prior = segments[i - 1]
    prior.text = [prior.text, current.text].filter(Boolean).join(' ')
    if (prior.role !== current.role) prior.role = '不确定'
    segments.splice(i, 1)
  }
  else if (action === 'resume-new') {
    resumes.push({ id: crypto.randomUUID(), name: '新简历', role: '', text: '' })
    resumeIndex = resumes.length - 1
  } else if (verb === 'resume' && action !== 'resume-done') resumeIndex = i
  else if (action === 'resume-done') {
    const item = resumes[resumeIndex]
    if(!item.name.trim()) return fieldError('resume-title','请填写简历名称。')
    if(!item.role?.trim()) return fieldError('resume-role','请填写目标岗位。')
    if(!item.text.trim()) return fieldError('resume-text','请上传文件或粘贴简历正文。')
    if (returnToGoal) { selectedResume=resumeIndex; returnToGoal=false; page='练习'; stage='导入'; goalConfirmed=false }
    resumeIndex = -1
  }
  else if (action === 'test-model' || action === 'save-dialogue' || action==='save-speech' || action==='test-speech') {
    const service=action==='test-speech'||action==='save-speech'?'speech':'dialogue'
    if(service==='dialogue'&&(!providers.dialogue.trim() || !/^[a-z0-9.-]{1,80}$/i.test(providers.dialogue.trim()))) return fieldError('dialogue','请填写有效的模型 ID，只使用字母、数字、点和连字符。')
    const testing=action==='test-model'
    const speechTest=action==='test-speech'
    if(speechTest&&!speechTestFile) return fieldError('speech-test-file','请先选择一段有声短录音。')
    const file=speechTestFile
    connectionTesting=testing; speechTesting=speechTest
    if(testing) connectionResult='正在保存配置并测试对话与图片服务，请稍候…'
    if(speechTest) speechTestResult='正在保存配置并测试语音转写，请稍候…'
    return void perform(async()=>{
      try {
        await persistSettings(service)
        if(testing) {
          connectionResult='配置已保存，正在测试对话与图片服务，请稍候…'; render()
          await remote('/test-model','POST',{})
          connectionResult='测试成功：对话与图片服务均可用。'
        } else if(speechTest && file) {
          const url=await upload(file,file.name)
          try {
            const result=await remote<{segments:Segment[]}>('/transcribe','POST',{id:mediaId(url)})
            speechTestResult=result.segments.length?'语音转写通过：'+result.segments.map(item=>item.text).join(' ').slice(0,160):'连接成功，但未识别到语音，请换一段有声录音。'
          } finally { await remote('/media/'+mediaId(url),'DELETE').catch(()=>undefined) }
        } else flash('本项配置已保存，尚未执行连接测试。')
      } catch(error) {
        if(testing) connectionResult='测试失败：'+(error as Error).message
        if(speechTest) speechTestResult='转写测试失败：'+(error as Error).message
        throw error
      } finally {connectionTesting=false; speechTesting=false}
    })
  }
  queueSave()
  render()
})
document.addEventListener('close',event=>{if(event.target===content.querySelector('#report-answer-dialog')){const id=reportAnswerId;reportAnswerId=undefined;content.querySelector<HTMLElement>(`[data-action="report-answer-${id}"]`)?.focus()}},true)
document.addEventListener('toggle',event=>{ const details=event.target as HTMLDetailsElement; if(details.isConnected&&details.classList.contains('microphone-setup'))microphoneSetupOpen=details.open; if(details.isConnected && details.dataset.reference) {const id=Number(details.dataset.reference);if(details.open)referenceOpenIds.add(id);else referenceOpenIds.delete(id)} },true)
document.addEventListener('keydown',event=>{
  const target=event.target as HTMLElement
  if(target.getAttribute('role')!=='tab'||working||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
  const list=target.closest('[role=tablist]');if(!list)return
  const tabs=[...list.querySelectorAll<HTMLButtonElement>('[role=tab]')]
  const i=tabs.indexOf(target as HTMLButtonElement)
  const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length
  event.preventDefault();const action=tabs[next].dataset.action;tabs[next].click();content.querySelector<HTMLElement>(`[data-action="${action}"]`)?.focus()
})
document.addEventListener('input', event => {
  const input = event.target as HTMLInputElement
  if (input.id==='dialogue-key') {if(input.value)modelKeyDrafts.set(modelKeyScope(),input.value);else modelKeyDrafts.delete(modelKeyScope());updateConfigurationStatus();return}
  if (input.id==='speech-key') {if(input.value)speechKeyDrafts.set(speechKeyScope(),input.value);else speechKeyDrafts.delete(speechKeyScope());updateConfigurationStatus();return}
  if (fieldErrors[input.id]) {delete fieldErrors[input.id]; input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); document.getElementById(input.id+'-error')?.remove()}
  if (input.id === 'reference-role' || input.id === 'target-role') targetRole = input.value
  if (input.id === 'practice-name') practiceName = input.value
  if (input.id === 'raw') raw = input.value
  if (input.id === 'jd') {jd = input.value;missing=null}
  if (input.id === 'url') link = input.value
  if (input.id === 'answer-text') {
    missing=null
    if (report.length) stale = true
    if(questions[active].transcriptCandidate!==undefined)questions[active].transcriptCandidate=input.value;else questions[active].transcript = input.value
    const favorite=content.querySelector('#own-favorite-control');if(favorite)favorite.innerHTML=favoriteControl(questions[active],'认可答案')
    const status=document.querySelector('#answer-status'); if(status) status.textContent=answerStatus(questions[active])
    const flow=content.querySelector('.flow-nav');if(flow){flow.nextElementSibling?.classList.contains('flow-condition')&&flow.nextElementSibling.remove();flow.outerHTML=stepNavigation()}
    const follow = assistant.querySelector<HTMLButtonElement>('[data-action=followup]')
    if (follow) follow.disabled = generatingFollowup || Boolean(recorder) || acquiring
  }
  if (input.dataset.reviewAnswer !== undefined) { questions[Number(input.dataset.reviewAnswer)].transcript = input.value; stale = true; missing = null }
  if (input.id === 'concern') concern = input.value
  if (input.id === 'draft') draft = input.value
  if (input.dataset.question !== undefined) {const item=questions[Number(input.dataset.question)];if(!approvedQuestionEdits.has(item.id)&&(item.transcript||item.audio||report.length)&&!window.confirm('修改此题会影响原回答的含义，已有报告将标记待重新评估。是否修改？')){input.value=item.text;return}approvedQuestionEdits.add(item.id);item.text=input.value;if(report.length)stale=true;missing=null}
  if (input.dataset.time !== undefined) segments[Number(input.dataset.time)].time = Math.max(0, Number(input.value) || 0)
  if (input.dataset.segment !== undefined) segments[Number(input.dataset.segment)].text = input.value
  if (input.id === 'resume-role') resumes[resumeIndex].role = input.value
  if (input.id === 'resume-title') resumes[resumeIndex].name = input.value
  if (input.id === 'resume-text') resumes[resumeIndex].text = input.value
  if (input.id === 'dialogue') {providers.dialogue = input.value;dialogueModelDrafts.set(modelKeyScope(),input.value); connectionResult='';document.getElementById('model-test-result')?.replaceChildren();updateConfigurationStatus()}
  queueSave()
})
document.addEventListener('change', event => {
  const input = event.target as HTMLInputElement
  if (input.id==='manual-mode') { manualMode=input.value; fieldErrors={}; queueSave();render();return }
  if(input.id==='microphone-device'){selectedMicrophone=input.value;return}
  if (input.id === 'history-filter') { historyFilter=input.value; render(); return }
  if (input.id === 'resume-pick') { selectedResume = Number(input.value); if(page==='录音复盘'&&!confirmed) practiceProfile=undefined; delete fieldErrors['resume-pick']; queueSave() }
  else if (input.id === 'provider') {
    dialogueModelDrafts.set(modelKeyScope(),providers.dialogue)
    providers.provider = input.value
    const savedScope=savedProviders.provider+(savedProviders.provider==='minimax'?':'+savedProviders.region:'')
    providers.dialogue = dialogueModelDrafts.get(modelKeyScope()) ?? (modelKeyScope()===savedScope?savedProviders.dialogue:undefined) ?? (input.value === 'kimi' ? 'kimi-k3.1-pro' : input.value === 'minimax' ? 'MiniMax-M3.1-Flash' : input.value === 'dashscope' ? 'qwen4-max' : 'gpt-4o')
    if(providers.shared&&!(providers.provider==='minimax'&&providers.speech==='asr-1.0'&&providers.region===providers.speechRegion)&&!(providers.provider==='dashscope'&&providers.speech!=='asr-1.0'))providers.shared=false
    modelConfigured = savedModelScope===modelKeyScope()
    connectionResult='';speechTestResult=''
    render()
  }
  else if (input.id === 'speech') {
    providers.speech = input.value
    if(!((providers.provider==='minimax'&&input.value==='asr-1.0'&&providers.region===providers.speechRegion)||(providers.provider==='dashscope'&&input.value!=='asr-1.0')))providers.shared=false
    speechConfigured = providers.shared?modelConfigured:savedSpeechScope===speechKeyScope()
    speechTestResult=''
    render()
  }
  else if (input.id === 'model-region') {
    providers.region = input.value
    if (providers.provider === 'minimax') modelConfigured = savedModelScope===modelKeyScope()
    if (providers.speech === 'asr-1.0') speechConfigured = providers.shared?modelConfigured:savedSpeechScope===speechKeyScope()
    connectionResult='';speechTestResult=''
    render()
  }
  else if(input.id==='speech-region'){providers.speechRegion=input.value;if(providers.shared&&providers.region!==providers.speechRegion)providers.shared=false;speechConfigured=savedSpeechScope===speechKeyScope();speechTestResult='';render()}
  else if (input.id === 'shared') { providers.shared = input.checked; render() }
  else if (input.dataset.supplement !== undefined) {
    const i = Number(input.dataset.supplement)
    if (input.checked) supplemental.add(i)
    else supplemental.delete(i)
    render()
    content.querySelector<HTMLInputElement>(`[data-supplement="${i}"]`)?.focus()
  } else if (input.dataset.role !== undefined) segments[Number(input.dataset.role)].role = input.value
  else if (input.id === 'speech-test-file' && input.files?.[0]) { speechTestFile=input.files[0]; speechTestResult='已选择测试录音，请点击「保存并测试转写」。'; render() }
  else if (input.id === 'shots'  && input.files?.length) {
    const files = Array.from(input.files)
    if (screenshots.length + files.length > 12) return fieldError('shots','一次最多上传 12 张截图，请减少选择数量。')
    return void perform(async () => {
      for (const file of files) screenshots.push({ name: file.name, url: await upload(file, file.name) })
    })
  } else if (input.id === 'file-audio' && input.files?.[0]) {
    const file = input.files[0]
    return void perform(async () => {
      const audio = await upload(file, file.name)
      const selected=selectedResume
      archiveRecording()
      selectedResume=selected
      jd=''
      originalAudio = audio
      originalName = file.name
      segments = []
      confirmed = false
      report = []
      missing = null
    })
  } else if (input.id === 'resume-file' && input.files?.[0]) {
    const file = input.files[0]
    const item = resumes[resumeIndex]
    return void perform(async () => {
      item.file = await upload(file, file.name)
      await save()
      const result = await remote<{ text: string }>('/resume-text', 'POST', { id: mediaId(item.file) })
      item.text = result.text
    })
  }
  queueSave()
})

async function init() {
  type State = ReturnType<typeof snapshot>
  const loaded = await remote<{ state?: State; version: number; settings: null | { provider: string; region: string; model: string; speech: string; shared: boolean; modelConfigured: boolean; speechConfigured: boolean;speechRegion?:string } }>()
  const state = loaded.state
  workVersion = loaded.version
  if (state) {
    favorites=Array.isArray(state.favorites)?state.favorites:[]
    ;({ page, stage, tab, questions, active, jd, link, raw, screenshots, resumes, resumeIndex, selectedResume,
      originalAudio, originalName, segments, confirmed, report, reportKind, questionId, stale, evidence, missing } = state)
    practiceSessionId=state.practiceSessionId || '';practiceCreatedAt=state.practiceCreatedAt || ''
    reportSnapshot=state.reportSnapshot
    goalReview=state.goalReview || false
    questionsConfirmed=Boolean(state.questionsConfirmed || ['练习','覆盖','报告'].includes(state.stage) || state.startedAt || state.report?.length)
    manualMode=state.manualMode || '已有题目'
    recordingId=state.recordingId || ''
    recordingCreatedAt=state.recordingCreatedAt || ''
    returnToGoal = state.returnToGoal || false
    goalConfirmed = Boolean(state.practiceProfile) && (state.goalConfirmed ?? true)
    toolTab = state.toolTab || '主动追问'
    pendingReport = state.pendingReport
    concern = state.concern || ''
    guidance = state.guidance || ''
    draft = state.draft || ''
    draftAudio = state.draftAudio || ''
    selectedAnswerId = state.selectedAnswerId
    for (const item of resumes) item.id ||= crypto.randomUUID()
    practiceProfile = state.practiceProfile
    targetRole = state.targetRole || ''
    practiceName = state.practiceName || ''
    startedAt = state.startedAt || ''
    migrateQuestions(questions)
    for (const entry of state.archives || []) migrateQuestions(entry.questions)
    archives = state.archives ?? []
    recordingArchives = state.recordingArchives ?? []
    for (const [kind, value] of state.reports || []) savedReports.set(kind, value)
    skipped = new Set(state.skipped ?? [])
    for (const item of [...questions,...archives.flatMap(entry=>entry.questions)]) if (item.pending) { item.pending = false; item.failed = true;item.transcriptionError='上次转写尚未完成，原声已保留，请重试转写。' }
  }
  if (page === '练习' && stage === '练习' && !questions[active]) stage = '导入'
  if (loaded.settings) {
    const settings = loaded.settings
    providers = { provider: settings.provider, region: settings.region, dialogue: settings.model, speech: settings.speech, shared: settings.shared,speechRegion:settings.speechRegion || settings.region || 'cn' }
    modelConfigured = settings.modelConfigured
    speechConfigured = settings.speechConfigured
    savedModelScope=modelConfigured?modelKeyScope():''
    savedSpeechScope=speechConfigured&&!providers.shared?speechKeyScope():''
  }
  savedProviders={...providers}
  dialogueModelDrafts.set(modelKeyScope(),providers.dialogue)
  const account = await fetch('/api/account').then(response => response.json())
  isAdmin = account.account?.role === 'admin'
  accountEnabled = account.enabled
  render()
  ready = true
  if (pendingReport) {
    reportKind=pendingReport.kind
    skipped=new Set(pendingReport.skipped)
    reportBusy='正在恢复报告任务，生成完成后会显示结果。'
    const resumeOrigin: Page = reportKind==='练习' ? '练习' : '录音复盘'
    void perform(async()=>{
      try {
        await makeScore()
        if(reportKind==='练习') stage='报告'
      } catch(error) {reportError=(error as Error).message; throw error}
      finally {reportBusy=''; operationOrigin=resumeOrigin}
    })
  }
}

void init().catch(error => { content.textContent = (error as Error).message })

import express from 'express'
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { PDFParse } from 'pdf-parse'
import type { IncomingMessage } from 'node:http'
import { load } from 'cheerio'
import mammoth from 'mammoth'
import {validateReportReview} from './report-review.js'
import { prompts, runModel, transcribe, transcribeMiniMax, type ModelProvider, type MiniMaxRegion } from './workspace-ai.js'

type Store = {
  version: number
  state?: Record<string, unknown>
  settings?: { speechRegion?:MiniMaxRegion; provider?: ModelProvider; region?: MiniMaxRegion; model: string; speech: string; shared: boolean; modelKey?: string; speechKey?: string }
  media: Record<string, { mime: string; name: string }>
}
class Invalid extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}
const allowedHosts = new Set(['www.xiaohongshu.com', 'xiaohongshu.com', 'xhslink.com', 'www.xhslink.com'])
const audioTypes = ['audio/webm', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/aac', 'audio/x-m4a', 'audio/flac', 'audio/x-wav']
const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
async function fetchNote(value: unknown) {
  if (typeof value !== 'string') throw new Invalid(400, '请填写小红书链接。')
  const link = value.match(/https:\/\/[^\s，。]+/)?.[0]
  if (!link) throw new Invalid(400, '请填写 HTTPS 小红书链接。')
  let url = new URL(link)
  for (let redirects = 0; redirects < 5; redirects++) {
    if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) || url.port || url.username || url.password) {
      throw new Invalid(400, '只支持小红书公开页面。')
    }
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12_000) })
    if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
      await response.body?.cancel()
      url = new URL(response.headers.get('location')!, url)
      continue
    }
    if (!response.ok || !response.body) break
    const reader = response.body.getReader()
    const chunks: Buffer[] = []
    let bytes = 0
    for (;;) {
      const read = await reader.read()
      if (read.done) break
      bytes += read.value.length
      if (bytes > 3_000_000) { await reader.cancel(); break }
      chunks.push(Buffer.from(read.value))
    }
    const $ = load(Buffer.concat(chunks).toString('utf8'))
    $('script, style, nav, footer').remove()
    const descriptions = [$('#detail-desc').text(), $('meta[property="og:description"]').attr('content')]
    const text = descriptions.find(item => item && item.trim().length >= 15)?.trim()
    if (text) return text.slice(0, 15_000)
    break
  }
  throw new Invalid(422, '无法读取公开面经正文，请改用截图或手动录入。')
}
export function workspaceApi(directory: string, owner: (request: IncomingMessage) => string | undefined) {
  const router = express.Router()
  const root = join(directory, 'workspace')
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const keyFile = join(root, '.key')
  try { writeFileSync(keyFile, randomBytes(32), { flag: 'wx', mode: 0o600 }) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  const vault = readFileSync(keyFile)
  function seal(value: string) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', vault, iv)
    return Buffer.concat([iv, cipher.update(value), cipher.final(), cipher.getAuthTag()]).toString('base64')
  }
  function unseal(value?: string) {
    if (!value) return ''
    const bytes = Buffer.from(value, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', vault, bytes.subarray(0, 12))
    decipher.setAuthTag(bytes.subarray(-16))
    return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString()
  }
  function folder(res: express.Response) { return join(root, res.locals.owner) }
  function open(res: express.Response): Store {
    try { return JSON.parse(readFileSync(join(folder(res), 'workspace.json'), 'utf8')) as Store } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return { version: 0, media: {} }
    }
  }
  function write(res: express.Response, store: Store) {
    const destination = folder(res)
    mkdirSync(destination, { recursive: true, mode: 0o700 })
    const temporary = join(destination, randomUUID() + '.tmp')
    try {
      writeFileSync(temporary, JSON.stringify(store), { mode: 0o600 })
      renameSync(temporary, join(destination, 'workspace.json'))
    } catch (error) {
      try { unlinkSync(temporary) } catch { /* The write may have failed before creating it. */ }
      throw error
    }
  }
  function media(res: express.Response, file: unknown) {
    if (typeof file !== 'string' || !/^[a-f0-9-]{36}$/.test(file)) throw new Invalid(404, '文件不存在。')
    const entry = open(res).media[file]
    if (!entry) throw new Invalid(404, '文件不存在。')
    return { ...entry, path: join(folder(res), file) }
  }
  router.use((req, res, next) => {
    const user = owner(req)
    if (!user) return next(new Invalid(401, '请先登录。'))
    const origin = req.headers.origin
    if (!['GET', 'HEAD'].includes(req.method) && origin && origin !== 'http://' + req.headers.host && origin !== 'https://' + req.headers.host) {
      return next(new Invalid(403, '请求来源不匹配。'))
    }
    res.locals.owner = user
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    next()
  })
  router.post('/media', express.raw({ type: () => true, limit: '80mb' }), (req, res) => {
    const mime = req.get('content-type')?.split(';')[0] || ''
    const name = typeof req.query.name === 'string' ? req.query.name.slice(0, 180) : '文件'
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Invalid(400, '请选择文件。')
    const documentType = /\.(pdf|docx|md|txt)$/i.test(name)
    if (!(audioTypes.includes(mime) || imageTypes.includes(mime) || documentType)) throw new Invalid(415, '不支持此文件格式。')
    if ((imageTypes.includes(mime) || documentType) && req.body.length > 8 * 1024 * 1024) throw new Invalid(413, '图片或文档最大 8 MB。')
    const store = open(res)
    const id = randomUUID()
    mkdirSync(folder(res), { recursive: true, mode: 0o700 })
    const path = join(folder(res), id)
    writeFileSync(path, req.body, { mode: 0o600 })
    store.media[id] = { mime: audioTypes.includes(mime) || imageTypes.includes(mime) ? mime : 'application/octet-stream', name }
    try { write(res, store) } catch (error) { unlinkSync(path); throw error }
    res.status(201).json({ id, url: '/api/workspace/media/' + id })
  })
  router.get('/media/:id', (req, res) => {
    const file = media(res, req.params.id)
    res.type(file.mime)
    if (file.mime === 'application/octet-stream') res.attachment(file.name).type('application/octet-stream')
    res.sendFile(file.path, { cacheControl: false })
  })
  router.delete('/media/:id', (req, res) => {
    const id = String(req.params.id)
    const file = media(res, id)
    const store = open(res)
    delete store.media[id]
    write(res, store)
    try { unlinkSync(file.path) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    res.json({ ok: true })
  })
  router.use(express.json({ limit: '4mb' }))
  router.get('/', (_req, res) => {
    const { state, version, settings } = open(res)
    res.json({ state, version, settings: settings ? { provider: settings.provider || 'openai', region: settings.region || 'cn', speechRegion:settings.speechRegion || settings.region || 'cn', model: settings.model, speech: settings.speech, shared: settings.shared, modelConfigured: Boolean(settings.modelKey), speechConfigured: Boolean(settings.shared ? settings.modelKey : settings.speechKey) } : null })
  })
  router.put('/', (req, res) => {
    const store = open(res)
    if (store.version !== req.body?.version) throw new Invalid(409, '其他窗口已更新工作台，请刷新后再编辑。')
    if (!req.body.state || typeof req.body.state !== 'object' || Array.isArray(req.body.state)) throw new Invalid(400, '工作台状态无效。')
    store.state = req.body.state
    store.version++
    write(res, store)
    res.json({ version: store.version })
  })
  router.put('/settings', (req, res) => {
    const { provider = 'openai', region = 'cn', speechRegion=region,model, speech, shared, modelKey, speechKey } = req.body
    if (!['openai', 'dashscope', 'minimax', 'kimi'].includes(provider) || !['cn', 'global'].includes(region)) throw new Invalid(400, '模型服务或地域无效。')
    if (shared && !((provider === 'minimax' && speech === 'asr-1.0') || (provider === 'dashscope' && speech !== 'asr-1.0'))) throw new Invalid(400, '仅同一家服务商可共用密钥。')
    if (typeof model !== 'string' || !/^[a-z0-9.-]{1,80}$/i.test(model) || typeof speech !== 'string' || !(speech === 'asr-1.0' || /^paraformer-realtime-v[12]$/.test(speech)) || typeof shared !== 'boolean') throw new Invalid(400, '模型配置无效。')
    for (const key of [modelKey, speechKey]) {
      if (key !== undefined && (typeof key !== 'string' || key.length > 1024 || !/^[\x21-\x7e]*$/.test(key))) throw new Invalid(400, 'API Key 格式无效。')
    }
    const store = open(res)
    const previous = store.settings
    const sameRegion = (previous?.region || 'cn') === region
    const sameModelProvider = (previous?.provider || 'openai') === provider && (provider !== 'minimax' || sameRegion)
    const sameSpeechProvider = (previous?.speech === 'asr-1.0') === (speech === 'asr-1.0') && (speech !== 'asr-1.0' || sameRegion)
    store.settings = { provider, region,speechRegion, model, speech, shared,
      modelKey: modelKey === undefined ? (sameModelProvider ? previous?.modelKey : undefined) : modelKey ? seal(modelKey) : undefined,
      speechKey: speechKey === undefined ? (sameSpeechProvider ? previous?.speechKey : undefined) : speechKey ? seal(speechKey) : undefined,
    }
    write(res, store)
    res.json({ ok: true })
  })
  router.patch('/settings/:service',(req,res)=>{
    const service=req.params.service
    if(service!=='dialogue'&&service!=='speech')throw new Invalid(404,'配置服务不存在。')
    const store=open(res)
    const previous=store.settings || {provider:'kimi' as ModelProvider,region:'cn' as MiniMaxRegion,speechRegion:'cn' as MiniMaxRegion,model:'',speech:'asr-1.0',shared:false}
    const next={...previous}
    const {key}=req.body
    if(key!==undefined&&(typeof key!=='string'||key.length>1024||!/^[\x21-\x7e]*$/.test(key)))throw new Invalid(400,'API Key 格式无效。')
    if(service==='dialogue'){
      const {provider,region='cn',model}=req.body
      if(!['kimi','openai','minimax','dashscope'].includes(provider)||!['cn','global'].includes(region)||typeof model!=='string'||!/^[a-z0-9.-]{1,80}$/i.test(model))throw new Invalid(400,'请填写有效的对话服务和模型 ID。')
      const same=(previous.provider||'openai')===provider&&(provider!=='minimax'||previous.region===region)
      next.provider=provider;next.region=region;next.model=model
      next.modelKey=key?seal(key):same?previous.modelKey:undefined
      const compatible=(provider==='minimax'&&previous.speech==='asr-1.0'&&region===(previous.speechRegion||previous.region||'cn'))||(provider==='dashscope'&&previous.speech!=='asr-1.0')
      if(previous.shared&&!compatible){next.shared=false;next.speechKey=previous.modelKey}
    }else{
      const {speech,region='cn',shared=false}=req.body
      if(!(speech==='asr-1.0'||/^paraformer-realtime-v[12]$/.test(speech))||!['cn','global'].includes(region)||typeof shared!=='boolean')throw new Invalid(400,'请填写有效的语音转写配置。')
      const compatible=(previous.provider==='minimax'&&speech==='asr-1.0'&&previous.region===region)||(previous.provider==='dashscope'&&speech!=='asr-1.0')
      if(shared&&(!compatible||!previous.modelKey))throw new Invalid(400,'复用密钥前，请先保存同一服务商和站点的对话密钥；也可以使用独立语音密钥。')
      const same=(previous.speech==='asr-1.0')===(speech==='asr-1.0')&&(speech!=='asr-1.0'||region===(previous.speechRegion||previous.region||'cn'))
      next.speech=speech;next.speechRegion=region;next.shared=shared
      next.speechKey=key?seal(key):same?(previous.shared?previous.modelKey:previous.speechKey):undefined
    }
    store.settings=next;write(res,store)
    res.json({ok:true,shared:next.shared,modelConfigured:Boolean(next.modelKey),speechConfigured:Boolean(next.shared?next.modelKey:next.speechKey)})
  })
  router.post('/test-model', async (_req, res) => {
    const settings = open(res).settings
    const key = unseal(settings?.modelKey)
    if (!key) throw new Invalid(409, '请先保存对话模型 API Key。')
    const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAL0lEQVR4nOzNAQkAAAgDMBH7V74xBNkKbJLUha4jYrFYLBaLxWKxWCwWi8Xij/ECAAD//0qL10gAAAAGSURBVAMAvKMDUHq+e0IAAAAASUVORK5CYII='
    const provider = settings!.provider || 'openai'
    await runModel(provider, key, settings!.model, 'connection', '连接测试', [], settings!.region)
    await runModel(provider, key, settings!.model, 'connection', '图片输入连接测试', [pixel], settings!.region)
    res.json({ok:true})
  })
  const runningJobs = new Set<string>()
  type ScoreJob = { status: 'running'|'succeeded'|'failed'; rows?: unknown; summary?:string; schemaVersion?:number; answerRevision?:string; error?: string }
  function jobPath(res: express.Response, id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Invalid(400, '报告任务编号无效。')
    mkdirSync(folder(res), {recursive:true, mode:0o700})
    return join(folder(res), id + '.report-job.json')
  }
  function writeJob(path: string, job: ScoreJob) {
    const temp = path + '.' + randomUUID() + '.tmp'
    writeFileSync(temp, JSON.stringify(job), {mode:0o600})
    renameSync(temp,path)
  }
  function readJob(path: string): ScoreJob | undefined {
    try {
      const job = JSON.parse(readFileSync(path,'utf8')) as ScoreJob
      if (job.status === 'running' && !runningJobs.has(path)) {
        job.status='failed'; job.error='报告服务已重启，请点击重新生成。'; writeJob(path,job)
      }
      return job
    } catch(error) { if ((error as NodeJS.ErrnoException).code==='ENOENT') return; throw error }
  }
  router.get('/report-jobs/:id', (req,res)=>{
    const job=readJob(jobPath(res,String(req.params.id)))
    if (!job) throw new Invalid(404,'报告任务尚未启动。')
    res.json(job)
  })
  router.post('/ai/:task', async (req, res) => {
    const task = req.params.task as keyof typeof prompts
    if (!Object.hasOwn(prompts, task)) throw new Invalid(404, '未知模型任务。')
    const settings = open(res).settings
    const key = unseal(settings?.modelKey)
    if (!key) throw new Invalid(409, settings?.provider === 'kimi' ? '请先配置 Kimi API Key。' : settings?.provider === 'minimax' ? '请先配置 MiniMax API Key。' : settings?.provider === 'dashscope' ? '请先配置阿里云模型 API Key。' : '请先在模型设置配置 OpenAI API Key。')
    const input = req.body.input
    const images: string[] = []
    if ((task === 'extract' || task === 'jd') && Array.isArray(req.body.images)) {
      if (req.body.images.length > 12) throw new Invalid(400, '一次最多识别 12 张截图。')
      for (const id of req.body.images) {
        const file = media(res, id)
        if (!imageTypes.includes(file.mime)) throw new Invalid(415, '请选择截图文件。')
        images.push('data:' + file.mime + ';base64,' + readFileSync(file.path).toString('base64'))
      }
    }
    let material = task === 'connection' ? '连接测试' : input
    if ((task === 'extract' || task === 'jd') && req.body.link) {
      const note = await fetchNote(req.body.link)
      material = task === 'extract' ? note : { ...input, note }
    }
    if (task === 'score' && typeof req.body.jobId === 'string') {
      const path=jobPath(res,req.body.jobId)
      const existing=readJob(path)
      if (existing) { res.json({jobId:req.body.jobId,...existing}); return }
      runningJobs.add(path)
      try { writeJob(path,{status:'running'}) } catch(error) {runningJobs.delete(path); throw error}
      void runModel(settings!.provider || 'openai', key, settings!.model, task, material, images, settings!.region)
        .then(result=>{
          const review=validateReportReview(result,input)
          writeJob(path,{status:'succeeded',...review})
        })
        .catch(error=>{
          try { writeJob(path,{status:'failed',error: error instanceof Error ? error.message : '报告生成失败，请重试。'}) }
          catch { /* A later poll reports the missing result or interrupted task. */ }
        }).finally(()=>runningJobs.delete(path))
      res.status(202).json({jobId:req.body.jobId,status:'running'})
      return
    }
    const result = await runModel(settings!.provider || 'openai', key, settings!.model, task, material, images, settings!.region)
    res.json(task === 'connection' ? { ok: true } : task==='score'?validateReportReview(result,input):result)
  })
  router.post('/transcribe', async (req, res) => {
    const file = media(res, req.body.id)
    if (!audioTypes.includes(file.mime)) throw new Invalid(415, '请选择音频文件。')
    const settings = open(res).settings
    const key = unseal(settings?.shared ? settings.modelKey : settings?.speechKey)
    if (!key) throw new Invalid(409, '已保存原声。请配置语音服务后重试，或直接输入文字。')
    const segments = settings!.speech === 'asr-1.0'
      ? await transcribeMiniMax(file.path, file.mime, key, settings!.speechRegion || settings!.region || 'cn')
      : await transcribe(file.path, file.mime, key, settings!.speech)
    res.json({ segments })
  })
  router.post('/resume-text', async (req, res) => {
    const file = media(res, req.body.id)
    let text: string
    if (/\.(md|txt)$/i.test(file.name)) text = readFileSync(file.path, 'utf8')
    else if (/\.docx$/i.test(file.name)) text = (await mammoth.extractRawText({ path: file.path })).value
    else if (/\.pdf$/i.test(file.name)) {
      const parser = new PDFParse({ data: readFileSync(file.path), disableFontFace: true, isEvalSupported: false })
      try { text = (await parser.getText()).text } finally { await parser.destroy() }
    }
    else throw new Invalid(415, '支持 PDF、DOCX、TXT 和 Markdown。')
    if(text.length>50_000) throw new Invalid(413,'简历正文超过 50000 字，请精简文件后重新上传；没有截断或替换当前正文。')
    res.json({ text })
  })
  router.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = error instanceof Invalid ? error.status : error.status === 413 ? 413 : error.status === 400 ? 400 : 502
    const expected = /^(Kimi|MiniMax|OpenAI|模型|阿里云|语音|无法解码|无法运行)/.test(error.message)
    res.status(status).json({ error: error instanceof Invalid || expected ? error.message : status === 413 ? '文件过大。' : '处理失败，请检查文件格式、服务配置或重试。' })
  })
  return router
}

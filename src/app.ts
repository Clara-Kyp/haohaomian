import { dimensions, type Answer, type Mode, type Session } from './shared.js'

const screen = document.querySelector<HTMLElement>('#screen')!
const steps = document.querySelector<HTMLElement>('#steps')!
const error = document.querySelector<HTMLElement>('#error')!
let current: Session | null = null
let questions = ['', '']
let confirmed = false
let index = 0
let mode: Mode = 'success'
let recorder: MediaRecorder | null = null
let unsaved: { blob: Blob; mode: Mode } | null = null
let busy = false
let timer: number | undefined

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}
const apiRoot = '/api/sessions'
function endpoint(suffix = '') { return `${apiRoot}/${current!.id}${suffix}` }
async function request(path: string, method = 'GET', data?: object | Blob): Promise<Session> {
  const headers = data ? { 'Content-Type': data instanceof Blob ? data.type : 'application/json' } : undefined
  const body = data instanceof Blob ? data : data ? JSON.stringify(data) : undefined
  const response = await fetch(path, { method, headers, body })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error)
  return result
}
function showError(reason: unknown) {
  error.textContent = reason instanceof Error ? reason.message : String(reason)
}
function bind(id: string, handler: () => void | Promise<void>) {
  document.getElementById(id)?.addEventListener('click', () => {
    if (busy) return
    error.textContent = ''
    Promise.resolve().then(handler).catch(showError)
  })
}
async function update(operation: () => Promise<Session>) {
  busy = true
  const controls = Array.from(screen.querySelectorAll<HTMLButtonElement>('button:enabled'))
  controls.forEach(button => button.disabled = true)
  try {
    current = await operation()
    render()
  } finally {
    busy = false
    controls.forEach(button => button.disabled = false)
  }
}
function intro(title: string, text: string) {
  return `<div class="intro"><h1>${title}</h1><p class="muted">${text}</p></div>`
}
function player(position: number) {
  return `<audio controls preload="metadata" aria-label="第 ${position + 1} 题录音" src="${endpoint(`/answers/${position}/audio`)}"></audio>`
}
function status(answer: Answer) {
  return { empty: '尚未录音', pending: '原声已保存 · 模拟转写中', ready: '文字已就绪', failed: '模拟转写失败 · 原声可回听' }[answer.status]
}
function answerStatus(position: number, review: boolean) {
  const answer = current!.answers[position]
  return `<p class="status" role="status">${status(answer)}</p>${review && answer.status === 'ready' ? `<p>${escapeHtml(answer.transcript)}</p>` : ''}
    ${review && answer.status === 'failed' ? `<button class="secondary" id="retry-${position}">重试转写</button>` : ''}`
}

function setup() {
  screen.innerHTML = intro(confirmed ? '确认题单' : '准备面试题', confirmed
    ? '确认题目和顺序后开始练习。' : '输入你想练的面试题，按顺序录下回答。') + `
    <div class="layout"><div class="panel">
    ${confirmed ? `<ol class="fields">${questions.map((q, i) => `<li class="question">${escapeHtml(q)}
      <div class="actions"><button class="secondary" id="up-${i}" ${i === 0 ? 'disabled' : ''}>上移</button>
      <button class="secondary" id="down-${i}" ${i === questions.length - 1 ? 'disabled' : ''}>下移</button></div></li>`).join('')}</ol>
      <div class="actions"><button id="create">开始练习</button><button class="secondary" id="edit">返回编辑</button></div>`
      : `<form id="questions" class="fields">${questions.map((q, i) => `<label>第 ${i + 1} 题<textarea name="q${i}" maxlength="500" placeholder="${i ? '例如：你如何处理团队里的技术分歧？' : '例如：介绍一个你主导的项目。'}">${escapeHtml(q)}</textarea></label>`).join('')}<div class="actions"><button type="submit">确认题单</button><button type="button" class="secondary" id="add-question" ${questions.length === 30 ? 'disabled' : ''}>新增一道题</button></div></form>`}
    </div><aside class="panel side"><div id="practice-history"></div><h2>练习方式</h2><ol><li>逐题手动开始和停止录音</li><li>结束后查看整场六维报告</li><li>点击证据回听对应作答</li></ol></aside></div>`
  document.querySelector<HTMLFormElement>('#questions')?.addEventListener('submit', event => {
    event.preventDefault()
    error.textContent = ''
    const data = new FormData(event.currentTarget as HTMLFormElement)
    questions = questions.map((_, i) => String(data.get('q' + i)).trim()).filter(Boolean)
    if (!questions.length) { questions = ['']; return showError('请填写至少一道题。') }
    confirmed = true
    render()
  })
  void showHistory()
  if (confirmed) questions.forEach((_, i) => {
    for (const [action, offset] of [['up', -1], ['down', 1]] as const) {
      bind(`${action}-${i}`, () => {
        const position = i + offset
        if (position < 0 || position >= questions.length) return
        const question = questions[i]
        questions[i] = questions[position]
        questions[position] = question
        render()
      })
    }
  })
  bind('add-question', () => {
    const form = document.querySelector<HTMLFormElement>('#questions')!
    const data = new FormData(form)
    questions = questions.map((_, i) => String(data.get('q' + i)))
    questions.push('')
    render()
    document.querySelector<HTMLTextAreaElement>(`[name="q${questions.length - 1}"]`)?.focus()
  })
  bind('edit', () => { confirmed = false; render() })
  bind('create', () => update(async () => {
    const result = await request(apiRoot, 'POST', { questions })
    history.replaceState(null, '', `/?session=${result.id}`)
    return result
  }))
}

async function showHistory() {
  const panel = document.querySelector<HTMLElement>('#practice-history')
  if (!panel) return
  try {
    const response = await fetch(apiRoot)
    if (!response.ok) return
    const records: { id: string; finished: number; question: string }[] = await response.json()
    if (!records.length) return
    panel.innerHTML = `<h2>最近的练习</h2><ul>${records.slice(0, 8).map(record =>
      `<li><a href="/?session=${encodeURIComponent(record.id)}">${escapeHtml(record.question.slice(0, 60))}</a> · ${record.finished ? '已结束' : '进行中'}</li>`).join('')}</ul>`
  } catch { /* The practice form remains available. */ }
}

void fetch('/api/account').then(response => response.json()).then(({ enabled }) => {
  if (enabled) document.getElementById('account-link')!.hidden = false
}).catch(() => undefined)

function practice() {
  const answer = current!.answers[index]
  screen.innerHTML = intro('录制作答', `第 ${index + 1} 题，共 ${current!.answers.length} 题`) + `
    <div class="layout"><div class="panel">
      <h2 class="question">${escapeHtml(answer.question)}</h2>
      ${answer.audio ? player(index) : ''}
      <div id="status-${index}">${recorder ? '<p class="status" role="status">正在录音</p>' : answerStatus(index, false)}</div>
      ${!answer.audio && !recorder && !unsaved ? `<label>模拟转写方式<select id="mode">
        <option value="success">正常成功</option><option value="slow">延迟 8 秒</option><option value="fail">模拟失败</option>
      </select></label>` : ''}
      <div class="actions">${recorder ? '<button class="recording" id="stop">停止并保存</button>'
        : unsaved ? '<button id="save">重试保存录音</button>'
        : `${!answer.audio ? '<button id="record">开始录音</button>' : ''}
          ${index > 0 ? '<button class="secondary" id="previous">上一题</button>' : ''}
          ${index < current!.answers.length - 1 ? '<button id="next">下一题</button>' : ''}
          <button class="secondary" id="finish">结束练习</button>`}
      ${!recorder && !unsaved ? `<details><summary>文字作答</summary>${transcriptForm(answer, index)}</details>` : ''}</div>
    </div><aside class="panel side"><h2>本场题单</h2><ol>${current!.answers.map(a => `<li>${escapeHtml(a.question)}</li>`).join('')}</ol></aside></div>`
  const select = document.querySelector<HTMLSelectElement>('#mode')
  if (select) {
    select.value = mode
    select.onchange = () => { mode = select.value as Mode }
  }
  bind('record', record)
  bind('stop', () => {
    const stop = document.querySelector<HTMLButtonElement>('#stop')!
    stop.disabled = true
    if (recorder?.state === 'recording') recorder.stop()
  })
  bind('save', save)
  bind('previous', () => { index--; mode = 'success'; render() })
  bind('next', () => { index++; mode = 'success'; render() })
  bindTranscript(index)
  bind('finish', () => update(() => request(endpoint('/finish'), 'POST')))
}

async function record() {
  const button = document.querySelector<HTMLButtonElement>('#record')!
  button.disabled = true
  let stream: MediaStream | undefined
  try {
    if (!navigator.mediaDevices || !window.MediaRecorder) throw new Error('请在 localhost 或 HTTPS 上使用支持录音的浏览器。')
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const input = stream
    const active = new MediaRecorder(input)
    const chunks: Blob[] = []
    active.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    active.onerror = () => showError('录音中断，请重新录制。')
    active.onstop = () => {
      input.getTracks().forEach(track => track.stop())
      recorder = null
      const blob = new Blob(chunks, { type: active.mimeType || chunks[0]?.type })
      if (!blob.size) {
        render()
        return showError('录音为空，请重新录制。')
      }
      unsaved = { blob, mode }
      render()
      save().catch(showError)
    }
    active.start()
    recorder = active
    render()
  } catch (reason) {
    stream?.getTracks().forEach(track => track.stop())
    if (reason instanceof DOMException) throw new Error('无法使用麦克风，请检查浏览器权限和输入设备。')
    throw reason
  } finally {
    button.disabled = false
  }
}

async function save() {
  const pending = unsaved!
  await update(async () => {
    try {
      return await request(endpoint(`/answers/${index}/audio?mode=${pending.mode}`), 'PUT', pending.blob)
    } catch (reason) {
      const latest = await request(endpoint()).catch(() => null)
      if (!latest?.answers[index].audio) throw reason
      return latest
    }
  })
  unsaved = null
  render()
}

function transcriptForm(answer: Answer, index: number) {
  return `<form id="transcript-${index}"><label>作答文字<textarea name="transcript" required maxlength="3000">${escapeHtml(answer.transcript)}</textarea></label>
  <div class="actions"><button class="secondary">保存文字</button></div></form>`
}

function bindTranscript(index: number) {
  const form = document.querySelector<HTMLFormElement>(`#transcript-${index}`)
  if (!form) return
  form.onsubmit = event => {
    event.preventDefault()
    if (busy) return
    error.textContent = ''
    const transcript = new FormData(form).get('transcript')
    update(() => request(endpoint(`/answers/${index}/transcript`), 'PUT', { transcript })).catch(showError)
  }
}

function review() {
  const report = current!.report
  const content = report ? `
    <div class="panel report-head"><div><h2>整场总分</h2><p class="muted">${current!.reportStale ? '作答已更新，报告待重评' : '按六项权重计算'}</p></div><strong class="total">${report.total.toFixed(2)} <small>/ 100</small></strong></div>
    <div class="score-grid">${report.rows.map((row, i) => `<article class="panel">
      <div class="score-top"><h3>${dimensions[i][0]}</h3><span class="score">${row.score} 分</span></div>
      <p class="muted">权重 ${dimensions[i][1]}%${row.answerIndex === null ? ' · 默认分' : ''}</p>
      ${row.answerIndex === null ? '' : `<blockquote>“${escapeHtml(row.quote)}”</blockquote><a href="#answer-${row.answerIndex}">回听第 ${row.answerIndex + 1} 题</a>`}
      <p>${row.tip}</p></article>`).join('')}</div>` : ''
  screen.innerHTML = intro(report ? '六维报告' : '检查作答', '转写与评分使用模拟数据。你可以在下方回听实际录音。') + `
    <div class="stack">${content}
    <h2>作答记录</h2>
    ${current!.answers.map((answer, i) => `<article class="panel evidence" id="answer-${i}" tabindex="-1">
      <h3>第 ${i + 1} 题 · ${escapeHtml(answer.question)}</h3>${answer.audio ? player(i) : ''}
      <div id="status-${i}">${answerStatus(i, true)}</div>
      <details><summary>手动补充作答文字</summary>
      ${transcriptForm(answer, i)}</details>
    </article>`).join('')}
    <div class="actions"><button id="report">${report ? '重新生成报告' : '生成六维报告'}</button><button class="secondary" id="restart">新建练习</button></div>
    <p class="muted">缺少转写的对应维度按 60 分计入报告。</p></div>`
  current!.answers.forEach((_, i) => bindTranscript(i))
  bind('report', async () => {
    await update(() => request(endpoint('/report'), 'POST'))
    scrollTo(0, 0)
  })
  bind('restart', () => {
    current = null
    questions = ['', '']
    confirmed = false
    index = 0
    mode = 'success'
    history.replaceState(null, '', '/')
    render()
    scrollTo(0, 0)
  })
}

function syncStatus() {
  if (!current) return
  current.answers.forEach((answer, i) => {
    const node = document.getElementById(`status-${i}`)
    if (node && answer.audio && !recorder) node.innerHTML = answerStatus(i, current!.finished)
    bind(`retry-${i}`, () => update(() => request(endpoint(`/answers/${i}/retry`), 'POST')))
  })
  const reportButton = document.querySelector<HTMLButtonElement>('#report')
  if (reportButton) reportButton.disabled = current.answers.some(answer => answer.status === 'pending')
  if (current.answers.some(answer => answer.status === 'pending')) {
    const id = current.id
    timer = window.setTimeout(async () => {
      if (current?.id !== id) return
      if (busy) return syncStatus()
      const before = current
      try {
        const latest = await request(endpoint())
        if (!busy && current === before) {
          current.answers = latest.answers
          syncStatus()
        }
      } catch {
        if (current?.id === id) syncStatus()
      }
    }, 500)
  }
}
function render() {
  clearTimeout(timer)
  const step = current?.finished ? 2 : current ? 1 : 0
  steps.innerHTML = ['题单', '录音', '复盘'].map((label, i) =>
    `<span ${i === step ? 'aria-current="step"' : ''}>0${i + 1} · ${label}</span>`).join('')
  if (current?.finished) review()
  else if (current) practice()
  else setup()
  syncStatus()
}

const id = new URL(location.href).searchParams.get('session')
if (id && /^[a-f0-9-]{36}$/.test(id)) {
  try {
    current = await request(`${apiRoot}/${id}`)
    const firstUnanswered = current.answers.findIndex(answer => !answer.audio && !answer.transcript)
    index = firstUnanswered === -1 ? current.answers.length - 1 : firstUnanswered
  } catch (reason) { showError(reason) }
}
if (new URL(location.href).searchParams.has('variant')) {
  const prototypePath = './report-prototype.js'
  const prototype = await import(prototypePath).catch(() => null)
  if (prototype) prototype.mountReportPrototype(screen, steps, current)
  else render()
} else {
  render()
}
if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView()

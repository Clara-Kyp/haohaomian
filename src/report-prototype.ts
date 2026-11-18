// Exploratory UI prototype: which layout makes it easiest to find the
// original answer behind a piece of feedback? Compare A/B/C on /?variant=.
import { dimensions, type Session, type Report } from './shared.js'

const variants = ['A', 'B', 'C'] as const
const labels = { A: '评分总览', B: '逐题回听', C: '证据对照' }
const demoQuotes = [
  '我先把交付目标拆成三个可验证的假设，再逐项检查结果。',
  '我让团队先对齐判断标准，再用两个小实验验证方案。',
]
const demoTips = [
  '说清项目经历与岗位要求的对应关系。', '补充关键技术取舍和验证方法。', '交代拆解依据和验证结果。',
  '说清你如何处理分歧和推动进展。', '补充复盘后具体改变的做法。', '用实际决策说明你如何处理压力。',
]
const demo: Session = {
  id: '', finished: true,
  answers: ['介绍你主导过的项目。', '你怎样处理团队分歧？'].map((question, i) =>
    ({ question, audio: false, status: 'ready', transcript: demoQuotes[i] })),
  report: {
    total: 76.15,
    rows: [76, 74, 82, 78, 72, 75].map((score, i) => {
      const answerIndex = i < 3 ? 0 : 1
      return { score, answerIndex, quote: demoQuotes[answerIndex], tip: demoTips[i] }
    }),
  },
}
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}

export function mountReportPrototype(screen: HTMLElement, steps: HTMLElement, session: Session | null) {
  const stylesheet = document.createElement('link')
  stylesheet.rel = 'stylesheet'
  stylesheet.href = '/report-prototype.css'
  document.head.append(stylesheet)
  steps.hidden = true
  screen.classList.add('prototype')
  const source = session?.report ? session : demo
  const report = source.report!
  const url = new URL(location.href)
  let active = variants.find(key => key === url.searchParams.get('variant')) ?? 'A'
  let selected = 0
  let panel: HTMLElement

  const answer = (i: number) => {
    const item = source.answers[i]
    return `<article class="panel answer-prototype" id="preview-answer-${i}" tabindex="-1">
      <p class="muted">第 ${i + 1} 题</p><h2>${escapeHtml(item.question)}</h2>
      ${item.audio ? `<audio aria-label="第 ${i + 1} 题录音" controls preload="metadata" src="/api/sessions/${source.id}/answers/${i}/audio"></audio>` : ''}
      <p>${escapeHtml(item.transcript || '这道题没有可用转写。')}</p>
    </article>`
  }
  const feedback = (row: Report['rows'][number], index: number, link = false) => `
    <div class="prototype-feedback">
      <div class="score-top"><h3>${dimensions[index][0]}</h3><strong class="score">${row.score} 分</strong></div>
      <p class="muted">权重 ${dimensions[index][1]}%${row.answerIndex === null ? ' · 默认分' : ''}</p>
      <p>${escapeHtml(row.tip)}</p>
      ${row.quote ? `<blockquote>${escapeHtml(row.quote)}</blockquote>` : ''}
      ${link && row.answerIndex !== null ? `<a href="#preview-answer-${row.answerIndex}">回听第 ${row.answerIndex + 1} 题</a>` : ''}
    </div>`
  const total = `<span class="prototype-total">${report.total.toFixed(2)} <small>/ 100</small></span>`
  const scoreOverview = () => `
    <div class="panel report-head"><h2>整场总分</h2>${total}</div>
    <div class="score-grid">${report.rows.map((row, i) => `<article class="panel">${feedback(row, i, true)}</article>`).join('')}</div>
    <h2>作答原声</h2>${source.answers.map((_, i) => answer(i)).join('')}`
  const questionReview = () => `
    <div class="prototype-inline"><h2>按作答顺序复盘</h2>${total}</div>
    ${source.answers.map((_, q) => `<div class="prototype-question">
      ${answer(q)}
      <div class="prototype-notes">${report.rows.map((row, i) => row.answerIndex === q ? feedback(row, i) : '').join('') || '<p class="muted">这道题暂无评分证据。</p>'}</div>
    </div>`).join('')}
    ${report.rows.some(row => row.answerIndex === null) ? `<div class="panel"><h2>缺少证据的维度</h2>${report.rows.map((row, i) => row.answerIndex === null ? feedback(row, i) : '').join('')}</div>` : ''}`
  const evidenceComparison = () => {
    const row = report.rows[selected]
    return `<div class="prototype-inline"><h2>选择维度查看证据</h2>${total}</div>
      <div class="prototype-compare">
        <div class="prototype-dimensions" role="group" aria-label="评分维度">
          ${dimensions.map(([label], i) => `<button class="secondary" data-dimension="${i}" aria-pressed="${selected === i}"><span>${label}</span><strong>${report.rows[i].score}</strong></button>`).join('')}
        </div>
        <div class="stack"><div class="panel">${feedback(row, selected)}</div>
          ${row.answerIndex === null ? '<p class="muted">本项没有可回听的评分证据。</p>' : answer(row.answerIndex)}
        </div>
      </div>`
  }
  function render() {
    panel.innerHTML = active === 'A' ? scoreOverview() : active === 'B' ? questionReview() : evidenceComparison()
    screen.querySelector('[data-variant-label]')!.textContent = `${active} · ${labels[active]}`
    panel.querySelectorAll<HTMLButtonElement>('button[data-dimension]').forEach(button => {
      button.onclick = () => {
        selected = Number(button.dataset.dimension)
        render()
        panel.querySelector<HTMLButtonElement>(`[data-dimension="${selected}"]`)?.focus()
      }
    })
  }
  function cycle(offset: number) {
    active = variants[(variants.indexOf(active) + offset + variants.length) % variants.length]
    url.searchParams.set('variant', active)
    url.hash = ''
    history.replaceState(null, '', url)
    render()
    scrollTo(0, 0)
  }
  const returnUrl = source.id ? `/?session=${source.id}` : '/'
  screen.innerHTML = `<div class="prototype-intro">
    <a href="${returnUrl}">返回${source.id ? '原报告' : '模拟面试'}</a>
    <h1>面试报告原型</h1>
    <p class="muted">${source.id ? '沿用本场报告、模拟评分和录音。' : '当前使用示例报告。打开已完成练习的网址并加上 variant=A，可对照自己的录音。'}</p>
  </div><div class="stack" id="prototype-panel"></div>
  <div class="prototype-switcher" role="group" aria-label="切换原型布局">
    <button aria-label="上一种布局" data-prev>←</button>
    <span data-variant-label aria-live="polite"></span>
    <button aria-label="下一种布局" data-next>→</button>
  </div>`
  panel = screen.querySelector('#prototype-panel')!
  screen.querySelector<HTMLButtonElement>('[data-prev]')!.onclick = () => cycle(-1)
  screen.querySelector<HTMLButtonElement>('[data-next]')!.onclick = () => cycle(1)
  document.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.altKey || event.metaKey || event.ctrlKey ||
      (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable], audio'))) return
    if (event.composedPath().some(element => element instanceof HTMLAudioElement)) return
    event.preventDefault()
    cycle(event.key === 'ArrowLeft' ? -1 : 1)
  })
  render()
}

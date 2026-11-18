import { createElement as h, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import '../public/workspace-prototype.css'
import brandImage from '../public/brand/haohaomian.png'

function Workspace() {
  useEffect(() => { void import('../src/workspace-prototype.js') }, [])
  return h('div', null,
    h('a', { className: 'skip', href: '#content' }, '跳到工作区'),
    h('div', { className: 'shell' },
      h('aside', { className: 'rail' },
        h('a', { className: 'brand', href: '/workspace' }, h('img', {className:'brand-image',src:brandImage,alt:'好好面，好好准备，好好面试'})),
        h('nav', { id: 'nav', 'aria-label': '工作台导航' })),
      h('main', { id: 'content', tabIndex: -1 }, h('p', null, '正在载入工作台…')),
      h('aside', { id: 'assistant', className: 'assistant', 'aria-label': '当前操作辅助区' })),
    h('p', { id: 'notice', role: 'status', 'aria-live': 'polite' }))
}

createRoot(document.querySelector('#root')!).render(h(Workspace))

type AccountEntry = { id: number; email: string; role: 'admin' | 'user'; active: number }
type Invitation = { email: string; expiresAt: number; consumedAt: number | null }
const panel = document.querySelector<HTMLElement>('#account')!
const title = document.querySelector<HTMLElement>('#title')!
const error = document.querySelector<HTMLElement>('#error')!
const url = new URL(location.href)
const invite = url.searchParams.get('invite')
if (invite) history.replaceState(null, '', '/account')

async function api<T>(suffix = '', method = 'GET', data?: object): Promise<T> {
  const response = await fetch('/api/account' + suffix, {
    method,
    headers: data ? { 'Content-Type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error)
  return value
}

function showError(reason: unknown) {
  error.textContent = reason instanceof Error ? reason.message : String(reason)
}

function action(button: HTMLButtonElement, operation: () => Promise<void>) {
  if (button.disabled) return
  error.textContent = ''
  button.disabled = true
  operation().catch(showError).finally(() => { button.disabled = false })
}

function formAction(operation: (data: FormData) => Promise<void>) {
  const form = panel.querySelector('form')!
  form.onsubmit = event => {
    event.preventDefault()
    action(form.querySelector('button')!, () => operation(new FormData(form)))
  }
}

function loginForm(email = '') {
  title.textContent = '登录好好面'
  panel.innerHTML = `<form class="fields">
    <label>邮箱<input type="email" name="email" required autocomplete="username"></label>
    <label>密码<input type="password" name="password" required minlength="12" maxlength="128" autocomplete="current-password"></label>
    <div><button>登录</button></div></form>`
  panel.querySelector<HTMLInputElement>('input[name="email"]')!.value = email
  formAction(async data => {
    await api('/login', 'POST', { email: data.get('email'), password: data.get('password') })
    location.assign('/workspace')
  })
}

async function manage() {
  const result = await api<{ accounts: AccountEntry[]; invites: Invitation[] }>('/manage')
  const userList = panel.querySelector('#users')!
  userList.replaceChildren(...result.accounts.map(user => {
    const line = document.createElement('li')
    line.textContent = `${user.email} · ${user.role === 'admin' ? '管理员' : user.active ? '已启用' : '已停用'} `
    if (user.role === 'user') {
      const toggle = document.createElement('button')
      toggle.className = 'secondary'
      toggle.textContent = user.active ? '停用' : '启用'
      toggle.setAttribute('aria-label', toggle.textContent + ' ' + user.email)
      toggle.onclick = () => action(toggle, async () => {
        await api('/manage/' + user.id, 'PUT', { active: !user.active })
        await manage()
      })
      line.append(toggle)
    }
    return line
  }))
  panel.querySelector('#invites')!.replaceChildren(...result.invites.map(invitation => {
    const line = document.createElement('li')
    line.textContent = `${invitation.email || '通用邀请'} · ${invitation.consumedAt ? '已使用' : invitation.expiresAt <= Date.now() ? '已过期' : '待使用'}`
    return line
  }))
}

async function render() {
  const { enabled, account } = await api<{ enabled: boolean; account: AccountEntry | null }>()
  if (!enabled) {
    panel.innerHTML = '<p>当前实例使用本机练习模式。</p><a href="/workspace">返回工作台</a>'
    return
  }
  if (invite || url.searchParams.get('mode')==='register') {
    title.textContent = '接受邀请'
    panel.innerHTML = '<form class="fields"><label>邀请码<input name="invite" required autocomplete="off"></label><label>邮箱<input name="email" type="email" autocomplete="username"></label><label>设置密码<input type="password" name="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><div><button>创建账户</button></div></form>'
    panel.querySelector<HTMLInputElement>('input[name="invite"]')!.value=invite || ''
    if(!invite || invite.length!==43)panel.querySelector<HTMLInputElement>('input[name="email"]')!.required=true
    formAction(async data => {
      const result = await api<{ email: string }>('/redeem', 'POST', { invite:data.get('invite'),email:data.get('email'), password: data.get('password') })
      loginForm(result.email)
    })
  } else if (!account) {loginForm();panel.insertAdjacentHTML('beforeend','<p><a href="/account?mode=register">使用邀请码注册</a></p>')}
  else {
    panel.innerHTML = '<p id="signed-in"></p><div class="actions"><a href="/workspace">返回工作台</a><button id="logout" class="secondary">退出登录</button></div>'
    panel.querySelector('#signed-in')!.textContent = account.email
    const logout = panel.querySelector<HTMLButtonElement>('#logout')!
    logout.onclick = () => action(logout, async () => {
      await api('/logout', 'POST')
      location.reload()
    })
    if (account.role === 'admin') {
      panel.insertAdjacentHTML('beforeend', `<h2>创建一次性邀请</h2><form class="fields">
        <label>受邀者邮箱（选填）<input type="email" name="email"></label><p>填写邮箱创建专属链接；留空生成通用邀请码，有效期7天。</p><div><button>创建邀请</button></div>
        </form><p id="invite-link"></p><button id="batch-invites" class="secondary">生成10个邀请码</button><div id="batch-results"></div><h2>账户</h2><ul id="users"></ul><h2>邀请记录</h2><ul id="invites"></ul>`)
      formAction(async data => {
        const result = await api<{ path: string }>('/invite', 'POST', { email: data.get('email') })
        const link = document.createElement('a')
        link.href = result.path
        link.textContent = link.href
        panel.querySelector('#invite-link')!.replaceChildren(link)
        await manage()
      })
      const batch=panel.querySelector<HTMLButtonElement>('#batch-invites')!
      batch.onclick=()=>action(batch,async()=>{
        const result=await api<{invites:{code:string;path:string;expiresAt:number}[]}>('/invites','POST',{count:10})
        const list=document.createElement('ol')
        for(const item of result.invites){const line=document.createElement('li');const code=document.createElement('code');code.textContent=item.code;const link=document.createElement('a');link.href=item.path;link.textContent='注册链接';line.append(code,' · ',link);list.append(line)}
        panel.querySelector('#batch-results')!.replaceChildren(list);await manage()
      })
      await manage()
    }
  }
}

render().catch(showError)

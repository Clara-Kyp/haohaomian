import { test, expect, type APIRequestContext } from '@playwright/test'

const authenticatedApp = 'http://127.0.0.1:43198'
const password = 'test-member-password'

test('邀请只能兑换一次，并隔离练习、报告和音频请求', async ({ browser, playwright }) => {
  const adminBrowser = await browser.newContext({ baseURL: authenticatedApp })
  const member = await playwright.request.newContext({ baseURL: authenticatedApp })
  const anonymous = await playwright.request.newContext({ baseURL: authenticatedApp })
  try {
    const admin = await adminBrowser.newPage()
    await admin.goto('/')
    await expect(admin).toHaveURL(/\/account$/)
    await admin.getByLabel('邮箱').fill('admin@example.test')
    await admin.getByLabel('密码').fill('test-admin-password')
    await admin.getByRole('button', { name: '登录' }).click()
    await expect(admin).toHaveURL(/\/workspace$/)
    await admin.goto('/account')
    await admin.getByLabel('受邀者邮箱').fill('member@example.test')
    await admin.getByRole('button', { name: '创建邀请' }).click()
    const link = admin.locator('#invite-link a')
    await expect(link).toBeVisible()
    const invitePath = (await link.getAttribute('href'))!
    const invite = new URL(invitePath, authenticatedApp).searchParams.get('invite')
    const redemptions = await Promise.all([0, 1].map(() => anonymous.post('/api/account/redeem', { data: { invite, password } })))
    expect(redemptions.map(result => result.status()).sort()).toEqual([201, 410])

    expect((await member.post('/api/account/login', { data: { email: 'member@example.test', password } })).ok()).toBeTruthy()
    expect((await member.get('/api/account/manage')).status()).toBe(403)
    expect((await anonymous.get('/api/sessions')).status()).toBe(401)
    const response = await member.post('/api/sessions', { data: { questions: ['一道题', '两道题', '三道题'] } })
    expect(response.status()).toBe(201)
    const created = await response.json()
    const path = '/api/sessions/' + created.id
    expect(created.answers).toHaveLength(3)
    expect((await anonymous.get(path)).status()).toBe(401)
    expect((await admin.request.get(path)).status()).toBe(404)
    expect(await (await admin.request.get('/api/sessions')).json()).toEqual([])
    await verifyPractice(member, path)
    const uploaded = await member.post('/api/workspace/media?name=private.txt', { data: Buffer.from('私人资料'), headers: { 'Content-Type': 'text/plain' } })
    expect(uploaded.status()).toBe(201)
    const { url } = await uploaded.json()
    expect((await admin.request.get(url)).status()).toBe(404)
    expect((await anonymous.get(url)).status()).toBe(401)
    expect(await (await member.get(url)).text()).toBe('私人资料')
    expect((await admin.request.get(path + '/answers/2/audio')).status()).toBe(404)
    expect((await admin.request.post(path + '/report')).status()).toBe(404)

    await admin.reload()
    await admin.getByRole('button', { name: '停用 member@example.test' }).click()
    await expect(admin.getByRole('button', { name: '启用 member@example.test' })).toBeVisible()
    expect((await member.get(path)).status()).toBe(401)
  } finally {
    await Promise.all([adminBrowser.close(), member.dispose(), anonymous.dispose()])
  }
})

async function verifyPractice(member: APIRequestContext, path: string) {
  const recording = Buffer.from([1, 2, 3, 4])
  const audio = path + '/answers/2/audio'
  expect((await member.put(audio + '?mode=fail', {
    data: recording,
    headers: { 'Content-Type': 'audio/webm' },
  })).ok()).toBeTruthy()
  expect((await member.get(audio, { headers: { Range: 'bytes=1-2' } })).status()).toBe(206)
  const transcript = path + '/answers/2/transcript'
  expect((await member.put(transcript, { data: { transcript: '第三题的实际回答' } })).ok()).toBeTruthy()
  expect((await member.post(path + '/finish')).ok()).toBeTruthy()
  const first = await (await member.post(path + '/report')).json()
  expect(first.report.rows[3].quote).toBe('第三题的实际回答')
  expect((await member.put(transcript, { data: { transcript: '更正后的回答' } })).ok()).toBeTruthy()
  const stale = await (await member.get(path)).json()
  expect(stale.reportStale).toBe(true)
  expect(stale.report.rows[3].quote).toBe('第三题的实际回答')
  const refreshed = await (await member.post(path + '/report')).json()
  expect(refreshed.reportStale).toBe(false)
  expect(refreshed.report.rows[3].quote).toBe('更正后的回答')
}

test('收藏随工作台账户隔离，普通用户和管理员不能读取其他用户收藏',async({playwright})=>{
  const admin=await playwright.request.newContext({baseURL:authenticatedApp})
  const alpha=await playwright.request.newContext({baseURL:authenticatedApp})
  const beta=await playwright.request.newContext({baseURL:authenticatedApp})
  const anon=await playwright.request.newContext({baseURL:authenticatedApp})
  try{
    expect((await admin.post('/api/account/login',{data:{email:'admin@example.test',password:'test-admin-password'}})).status()).toBe(200)
    for(const [name,context] of [['alpha',alpha],['beta',beta]] as const){
      const email='favorite-'+name+'-'+Date.now()+'@example.test'
      const invitation=await(await admin.post('/api/account/invite',{data:{email}})).json()
      const invite=new URL(invitation.path,authenticatedApp).searchParams.get('invite')
      expect((await context.post('/api/account/redeem',{data:{invite,password}})).status()).toBe(201)
      expect((await context.post('/api/account/login',{data:{email,password}})).status()).toBe(200)
    }
    const saved={id:'favorite-alpha',sessionId:'session-a',questionId:1,source:'认可答案',question:'alpha的私人题目',answer:'alpha的私人答案',targetRole:'产品经理',createdAt:new Date().toISOString()}
    let data=await(await alpha.get('/api/workspace')).json()
    expect((await alpha.put('/api/workspace',{data:{version:data.version,state:{favorites:[saved]}}})).ok()).toBe(true)
    data=await(await beta.get('/api/workspace')).json()
    expect(data.state?.favorites??[]).toEqual([])
    expect((await beta.put('/api/workspace?owner=alpha',{data:{version:data.version,state:{favorites:[]}}})).ok()).toBe(true)
    expect((await(await alpha.get('/api/workspace')).json()).state.favorites).toEqual([saved])
    expect(JSON.stringify(await(await beta.get('/api/workspace?owner=alpha')).json())).not.toContain('alpha的私人答案')
    expect(JSON.stringify(await(await admin.get('/api/workspace')).json())).not.toContain('alpha的私人答案')
    expect((await anon.get('/api/workspace')).status()).toBe(401)
  }finally{await Promise.all([admin.dispose(),alpha.dispose(),beta.dispose(),anon.dispose()])}
})

test('通用邀请码批量生成10个，可自填邮箱兑换一次并进入工作台',async({browser,playwright})=>{
  const admin=await playwright.request.newContext({baseURL:authenticatedApp})
  const anonymous=await playwright.request.newContext({baseURL:authenticatedApp})
  const member=await browser.newContext({baseURL:authenticatedApp})
  try{
    await admin.post('/api/account/login',{data:{email:'admin@example.test',password:'test-admin-password'}})
    expect((await anonymous.post('/api/account/invites',{data:{count:10}})).status()).toBe(401)
    const batch=await admin.post('/api/account/invites',{data:{count:10}})
    expect(batch.status()).toBe(201)
    const {invites}=await batch.json()
    expect(invites).toHaveLength(10)
    expect(new Set(invites.map((entry:any)=>entry.code)).size).toBe(10)
    expect(invites[0].expiresAt-Date.now()).toBeGreaterThan(6*86400000)
    expect((await anonymous.post('/api/account/redeem',{data:{invite:invites[0].code,password}})).status()).toBe(400)
    const email='open-invite-'+Date.now()+'@example.test'
    const page=await member.newPage()
    await page.goto('/account?mode=register')
    await page.getByLabel('邀请码',{exact:true}).fill(invites[0].code.toLowerCase())
    await page.getByLabel('邮箱',{exact:true}).fill(email)
    await page.getByLabel('设置密码',{exact:true}).fill(password)
    await page.getByRole('button',{name:'创建账户',exact:true}).click()
    await expect(page.getByRole('heading',{name:'登录好好面',exact:true})).toBeVisible()
    await page.getByLabel('密码',{exact:true}).fill(password)
    await page.getByRole('button',{name:'登录',exact:true}).click()
    await expect(page).toHaveURL(/\/workspace$/)
    expect((await anonymous.post('/api/account/redeem',{data:{invite:invites[0].code,email:'other@example.test',password}})).status()).toBe(410)
    const tries=await Promise.all(['a','b'].map(suffix=>anonymous.post('/api/account/redeem',{data:{invite:invites[1].code,email:'race-'+Date.now()+suffix+'@example.test',password}})))
    expect(tries.map(r=>r.status()).sort()).toEqual([201,410])
    expect((await member.request.post('/api/account/invites',{data:{count:10}})).status()).toBe(403)
  }finally{await admin.dispose();await anonymous.dispose();await member.close()}
})

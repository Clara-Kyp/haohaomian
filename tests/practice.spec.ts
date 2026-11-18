import { test, expect, type Page } from '@playwright/test'

async function begin(page: Page) {
  await page.goto('/')
  await page.getByLabel('第 1 题').fill('介绍你主导过的项目。')
  await page.getByLabel('第 2 题').fill('你怎样处理团队分歧？')
  await page.getByRole('button', { name: '确认题单' }).click()
  await expect(page.getByRole('heading', { name: '确认题单' })).toBeVisible()
  await page.getByRole('button', { name: '开始练习' }).click()
}
async function record(page: Page, mode: string, after: string) {
  await page.getByLabel('模拟转写方式').selectOption(mode)
  await page.getByRole('button', { name: '开始录音' }).click()
  await expect(page.getByText('正在录音')).toBeVisible()
  const stop = page.getByRole('button', { name: '停止并保存' })
  // Wait for the fake microphone to produce several audio frames.
  await page.waitForTimeout(450)
  await stop.click()
  await expect(page.getByRole('button', { name: after })).toBeEnabled()
}
async function playback(page: Page, answer: number) {
  const audio = page.locator(`#answer-${answer} audio`)
  await audio.evaluate(async (el: HTMLAudioElement) => {
    el.muted = true
    await el.play()
  })
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0)
}

test('录音、延迟转写、六维报告和刷新后的原声', async ({ page }) => {
  await begin(page)
  await record(page, 'slow', '下一题')
  await expect(page.getByText('模拟转写中')).toBeVisible()
  await page.getByRole('button', { name: '下一题' }).click()
  await expect(page.getByRole('heading', { name: '你怎样处理团队分歧？' })).toBeVisible()
  await record(page, 'success', '结束练习')
  await page.getByRole('button', { name: '结束练习' }).click()
  const generate = page.getByRole('button', { name: '生成六维报告' })
  await expect(generate).toBeDisabled()
  await expect(generate).toBeEnabled({ timeout: 12000 })
  await generate.click()
  await expect(page.getByRole('heading', { name: '六维报告' })).toBeVisible()
  await expect(page.locator('.score-grid article')).toHaveCount(6)
  await expect(page.getByText('76.15')).toBeVisible()
  await page.getByRole('link', { name: '回听第 1 题' }).first().click()
  await expect(page).toHaveURL(/#answer-0$/)
  await expect(page.locator(':target')).toContainText('介绍你主导过的项目。')
  await playback(page, 0)
  await page.reload()
  await expect(page.getByRole('heading', { name: '六维报告' })).toBeVisible()
  await playback(page, 0)
  await playback(page, 1)
})

test('转写失败仍能结束、回听、计入默认分并恢复报告', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await begin(page)
  await record(page, 'success', '下一题')
  await page.getByRole('button', { name: '下一题' }).click()
  await record(page, 'fail', '结束练习')
  await page.getByRole('button', { name: '结束练习' }).click()
  await expect(page.getByText('模拟转写失败 · 原声可回听')).toBeVisible()
  await page.getByRole('button', { name: '生成六维报告' }).click()
  await expect(page.getByText('默认分', { exact: false }).filter({ hasText: '权重' })).toHaveCount(3)
  await expect(page.getByText('71.20')).toBeVisible()
  await page.reload()
  await playback(page, 1)
  await page.getByRole('button', { name: '重试转写' }).click()
  await expect(page.getByRole('button', { name: '重新生成报告' })).toBeEnabled()
  const answer = page.locator('#answer-1')
  await answer.getByText('手动补充作答文字').click()
  await answer.getByLabel('作答文字').fill('我记录了两种方案，和团队一起验证后确定取舍。')
  await answer.getByRole('button', { name: '保存文字' }).click()
  await page.getByRole('button', { name: '重新生成报告' }).click()
  await expect(page.locator('.score-grid blockquote').filter({ hasText: '我记录了两种方案' })).toHaveCount(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})

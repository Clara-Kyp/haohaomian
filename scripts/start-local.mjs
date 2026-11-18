import { spawnSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

process.chdir(fileURLToPath(new URL('../', import.meta.url)))
if (Number(process.versions.node.split('.')[0]) < 24) {
  console.error('请先安装 Node.js 24 或更高版本：https://nodejs.org/zh-cn/download')
  process.exit(1)
}
const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' })
if (ffmpeg.status !== 0) {
  console.warn('未找到 FFmpeg。录音转写需要安装它：https://ffmpeg.org/download.html')
}
const built = spawnSync(process.execPath, [process.env.npm_execpath, 'run', 'build'], { stdio: 'inherit' })
if (built.status !== 0) process.exit(built.status || 1)
const port = process.env.PORT || '3000'
console.log(`\n打开工作台：http://localhost:${port}/workspace\n停止服务：Ctrl+C。练习资料保存在 data/，升级时请保留。\n`)
const server = spawn(process.execPath, ['dist/server.js'], {
  stdio: 'inherit',
  env: { ...process.env, HOST: '127.0.0.1', PORT: port },
})
server.on('error', error => { console.error(error.message); process.exitCode = 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal))
server.on('exit', code => { process.exitCode = code || 0 })

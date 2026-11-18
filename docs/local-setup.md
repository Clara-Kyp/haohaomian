# 在自己的电脑上体验好好面

下载、解压、启动。无需租服务器、绑定域名、注册账户或领取邀请码。

## 下载

[下载本地体验版 ZIP](https://github.com/Clara-Kyp/haohaomian/releases/latest/download/haohaomian-local.zip)，解压到一个固定目录。当前提供源码体验版，需要安装运行环境；不是双击安装的桌面客户端。

## 方式一：Node.js 启动

1. 安装 [Node.js 24 LTS](https://nodejs.org/zh-cn/download)，安装后重新打开终端。
2. 安装 [FFmpeg](https://ffmpeg.org/download.html) 并加入 PATH。macOS 已安装 Homebrew 的用户可以运行 `brew install ffmpeg`；Windows 可使用 `winget install --id Gyan.FFmpeg --exact`，完成后重新打开终端。
3. 在解压目录打开终端（Windows 可在文件夹空白处右键选择「在终端中打开」），依次运行：

```sh
npm ci
npm run local
```

打开 **http://localhost:3000/workspace**，在「模型设置」填写自己的模型和 API Key，保存并测试后开始练习。模型服务商的密钥获取链接就在设置页。

以后启动只需运行 `npm run local`。终端需保持打开；按 `Ctrl+C` 停止。首次安装依赖需要联网，AI 功能也需要联网。

## 方式二：Docker 启动

已安装并运行 Docker Desktop 的用户，在解压目录运行：

```sh
docker compose up --build -d
```

打开 **http://localhost:3001/workspace**。镜像已包含 Node.js 和 FFmpeg，不需要在电脑上另外安装。第一次构建需要下载镜像和依赖。

停止：`docker compose stop`。再次启动：`docker compose up -d`。资料保存在 Docker 的 `workspace_data` 卷；不要使用 `docker compose down -v`，它会删除资料卷。两种启动方式使用不同的数据存储，请固定使用一种。

## 资料与升级

Node.js 方式将资料保存在项目的 `data/` 文件夹，包括录音、简历、收藏和加密模型配置。升级前停止服务并备份整个文件夹，将它复制到新版解压目录再启动。必须保留 `workspace/.key` 才能读取原有模型密钥。

AI 出题、转写、参考答案和评分会调用你配置的服务商，相关题目、回答或录音会发送给该服务商，费用按其规则结算。

## 常见问题

- **提示找不到 npm / node**：完成 Node.js 安装后，重新打开终端，运行 `node --version`，确认版本为 24 或以上。
- **提示找不到依赖**：确认终端位于包含 `package.json` 的解压目录，并先运行 `npm ci`。
- **3000 端口已占用**：先关闭旧的好好面进程，或换端口。macOS/Linux：`PORT=3002 npm run local`；Windows PowerShell：`$env:PORT='3002'` 后运行 `npm run local`，再访问对应端口。
- **录音转写不可用**：运行 `ffmpeg -version` 确认已安装，并在「模型设置」单独测试语音服务；对话模型配置成功不代表语音配置成功。
- **浏览器录不到声音**：使用本机 `localhost` 地址，并允许浏览器使用麦克风。

本地版只监听本机地址。多人在线部署见[部署指南](deployment.md)。

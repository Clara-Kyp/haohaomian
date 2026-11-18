# 部署好好面

## 产品首页

GitHub Pages发布`site/`。推送main分支中的首页修改，GitHub Actions会自动更新线上页面。只上传产品首页资源，账户数据、邀请码和API Key不进入Pages构建。

## 完整工作台

使用支持Docker及持久磁盘的服务器。镜像包含Node.js 24和FFmpeg；应用端口为3001，数据目录为`/app/data`。为该目录挂载持久磁盘，设置：

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3001
DATA_DIR=/app/data
ADMIN_EMAIL=your-email@example.com
ADMIN_PASSWORD=replace-with-a-long-random-password
SECURE_COOKIES=1
```

管理员凭据仅在空数据目录首次启动时用于初始化。通过HTTPS访问`/workspace`，在「账户与邀请」生成邀请码。通用邀请码有效期7天，每码一次，使用者填写自己的邮箱。

当前产品首页提供本地体验版下载，不连接在线工作台。本机体验无需邀请码。若自行提供多人服务，可单独分享实例的 `/account?mode=register` 注册地址。

## 数据与备份

暂停服务后，完整备份数据目录；恢复时复制回持久磁盘再启动。必须保留`workspace/.key`，以便解密已保存的模型配置。

## 本机启动

请按照[本地使用指南](local-setup.md)启动。安装 Node.js 24+ 和 FFmpeg 后运行 `npm ci`、`npm run local`，访问 `http://localhost:3000/workspace`。本机体验无需邀请码。

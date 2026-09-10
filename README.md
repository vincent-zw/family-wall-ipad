# 家庭 AI 信息墙

面向旧 iPad Safari 的家庭看板。页面由 CloudBase 静态托管分发，留言、提醒、课程和每日学习内容保存在低频调用的 CloudBase 文档数据库中；云端不可用时自动使用设备本地缓存。

## 已有功能

- 早餐英语：每日单词、句子、点读与完成记录
- 家庭课程：周毅成、周毅然的课程和兴趣班
- 家庭提醒：定时提醒、完成状态与页面内语音播报
- 家庭留言：手机、电脑、iPad 共享
- 家庭通话：外地发起语音/视频呼叫，客厅 iPad 确认接听
- 每日内容中心：远程安排英语和小科普
- 定位天气、中文/英文声音选择，以及百度音箱等未来接口

## 本地运行

1. 复制 `.env.example` 为 `.env.local`。
2. 填入 CloudBase 环境 ID 和六位家庭访问码。
3. 运行 `npm install`、`npm run dev`。

如果环境 ID 仍是示例值，页面以本机预览模式打开，数据只保存在当前浏览器。

## CloudBase 发布

1. 在 CloudBase 创建环境并开启匿名登录。
2. 使用 `tcb login` 登录。
3. 运行 `npm run build`。
4. 初始化数据库：`npm run deploy:database`。
5. 部署静态文件：`tcb hosting deploy dist -e <环境ID>`。

## 家庭通话配置

通话使用腾讯云 TRTC。网页通过 `VITE_FAMILY_SECURE_API_URL` 指向 CloudBase HTTP 访问服务，再由 `family-api` 云函数签发临时票据；不依赖匿名用户的 Web SDK 云函数调用权限。`SDKAppID` 可以公开，`SDKSecretKey` 只能保存在 `family-api` 云函数的 `TRTC_SECRET_KEY` 环境变量中，禁止写入网页代码、`.env.local` 或提交到 Git。密钥如果曾经出现在聊天、截图或日志中，应先在 TRTC 控制台重置，再把新密钥直接填入 CloudBase 控制台。云函数只向通过家庭访问码验证的设备签发一小时有效的 UserSig。

数据库表不向浏览器开放，页面只能调用验证、读取和保存三个受控函数。`.env.local` 已被 Git 忽略，家庭访问码不会进入前端构建产物。

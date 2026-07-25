# 个人主页 · 部署前替换清单

本目录为个人求职主页的静态资源。打开 `../index.html` 即可本地预览。

## 需要替换的占位内容

| 占位 | 位置 | 怎么改 |
|------|------|--------|
| `李知行` | index.html 多处（logo、title、footer） | 改为你的真实姓名 |
| `你@example.com` | 联系区 | 改为你的邮箱 |
| `your-wechat` | 联系区 | 改为你的微信号 |
| `your-github` / `github.com/your-github` | 联系区 / 项目链接 | 改为你的 GitHub |
| `assets/resume.pdf` | 简历下载 | 放入你的真实简历 PDF（可用 Word 版导出） |
| `assets/avatar.svg` | Hero 头像 | 换成你的照片（建议 1:1，改 `index.html` 头像 div 为 `<img>`） |

## 项目 / 作品链接

搜索 index.html 中的 `REPLACE-` 前缀链接，替换为你的真实地址：
- `REPLACE-github-envmonitor` — 多传感器融合项目仓库
- `REPLACE-demo-envmonitor` — 该项目演示地址
- `REPLACE-github-face` — 人脸表情项目仓库
- `REPLACE-demo-face` — 该项目演示地址
- `REPLACE-xlsx-sts` — 《杀戮尖塔》数值 Demo（Excel）
- `REPLACE-pdf-report` — 数值拆解报告 PDF
- `REPLACE-docx-resume` — 简历 Word 版
- `REPLACE-github-home` — 你的 GitHub 主页

## 部署

- **GitHub Pages**：把 `personal_site/` 整个目录推到仓库，Settings → Pages 选 `main` 分支根目录。
- **Vercel / Netlify**：直接拖拽 `personal_site/` 文件夹，无需构建。
- **本地**：双击 `index.html` 即可，无需任何依赖。

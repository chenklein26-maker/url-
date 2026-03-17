## Article Flow / 文章采集与润色助手

一个基于 Electron + React 的 **文章采集、AI 润色与图片批量处理工具**，由小龙开发。  
专注于把「读网页 → 采集内容 → AI 改写 → 处理图片 → 发稿」变成一条顺滑的流水线。

An **Electron + React based tool** for extracting articles, refining them with AI, and batch processing images, created by Xiaolong.  
It streamlines the workflow from “reading on the web” to “clean content + processed images ready to publish”.

---

## ✨ 功能特点 / Features

- **一键采集文章 / One‑click article extraction**  
  输入 URL，自动抓取正文与主图、内容配图。  
  Paste a URL and automatically extract the main content and images.

- **AI 润色与结构优化 / AI polishing & restructuring**  
  基于可配置提示词，对文章进行润色、改写、总结或结构重组。  
  Use configurable prompts to polish, rewrite, summarize, or restructure articles.

- **图片批量处理 / Batch image processing**  
  自动按统一宽度与格式导出图片，并按规则重命名。  
  Export images with unified width/format and consistent naming rules.

- **文件夹监控 / Folder watching**  
  监听本地目录，新图片落到目录中即可自动处理。  
  Watch local folders and auto‑process new images when they appear.

- **本地部署与桌面应用 / Local desktop app**  
  支持浏览器模式与 Electron 桌面版，本地运行，无需上传到云端。  
  Run locally in browser or Electron desktop mode, no content uploaded to third‑party servers.

- **辅助插件友好 / Plugin‑friendly**  
  可配合浏览器一键复制链接插件（如 Grabbit）使用，实现多页内容批量处理。  
  Works great with browser link‑collector extensions (e.g. Grabbit) for batch URL handling.

---

## 🧩 技术栈 / Tech Stack

- **Frontend**：React 19, TypeScript, Vite, Tailwind（via `@tailwindcss/vite`）, motion, lucide-react  
- **Backend**：Node.js, Express, jsdom, @mozilla/readability, axios, sharp  
- **Desktop**：Electron  
- **Others**：chokidar（文件监听 / file watching）, dotenv, Prettier, ESLint, TypeScript

---

## 🚀 快速开始 / Getting Started

### 1. 环境准备 / Prerequisites

- 安装 [Node.js 18+](https://nodejs.org/)（推荐 20+）  
  Install [Node.js 18+](https://nodejs.org/) (20+ recommended).
- 克隆本项目 / Clone this repository：

```bash
git clone https://github.com/chenklein26-maker/Articleflow.git
cd Articleflow
```

### 2. 安装依赖 / Install dependencies

```bash
npm install
```

> 仅首次需要执行，之后一般不需要重复安装。  
> You only need to run this once for dependencies.

### 3. 启动开发环境 / Run in development

#### 浏览器模式 / Browser mode

```bash
npm run dev
```

- 终端看到 `Server running on http://localhost:3000`  
- 浏览器打开 `http://localhost:3000`

#### 桌面应用 / Desktop (Electron)

```bash
npm run start
```

或在 Windows 下直接双击 `启动应用.bat`：  

- 首次运行会自动检测 Node.js 并执行 `npm install`  
- 之后会直接启动 Electron 桌面版

---

## 🧑‍🤝‍🧑 团队快速上手 / For Team Members

> 适合发给非技术同事看的版本。

1. 安装 Node.js 18+。  
2. 把项目文件夹发给同事，同事解压到任意路径。  
3. 让同事 **双击 `启动应用.bat`**：
   - 第一次会自动安装依赖；
   - 之后每次双击即可直接打开桌面应用。
4. 打开应用 → 进入「通用设置」：
   - 配置自己的 API Key；
   - 按需配置代理与图片输出参数。

---

## ⚙️ 模型与 API 配置（简要）  
## Models & API (brief)

> 大部分细节可以在应用的「通用设置」里调整，这里只说明核心概念。

- 内置多种模型预设（例如 **DeepSeek、GPT‑4o、Qwen 兼容模式**），  
  每个预设都已经包含推荐的 **Base URL** 与 **model 名称**。
- 你只需要在界面中：
  - 选择想用的模型（例如 DeepSeek V3、GPT‑4o、Qwen Plus）；  
  - 在 **API Key** 输入框填入对应服务商的密钥即可。

如果你需要接入自己的 OpenAI 兼容服务：

1. 在下拉框中选择 **“自定义 (OpenAI 兼容)” / Custom (OpenAI‑compatible)**；  
2. 在展开的区域中填写：
   - API 地址（Base URL）；  
   - 模型名称（model name）。  

保存后，后续调用都会使用你自己的接口配置。

---

## 📂 目录结构（简要） / Project Structure (simplified)

> 实际结构以仓库为准，下面是主要文件的示意。

```text
Articleflow/
  ├─ src/                 # 前端与界面逻辑 / frontend & UI
  │  └─ App.tsx           # 主界面与业务逻辑 / main React app
  ├─ electron-main.cjs    # Electron 主进程入口 / Electron main process
  ├─ preload.cjs          # 预加载脚本 / preload script
  ├─ server.ts            # 本地 API 与内容提取服务 / local API & scraping server
  ├─ public/              # 静态资源 / static assets
  ├─ .env.example         # 环境变量示例 / env example
  ├─ package.json         # 项目依赖与脚本 / dependencies & scripts
  ├─ tsconfig.json        # TypeScript 配置 / TS config
  └─ README.md
```

---

## 🧪 典型使用场景 / Typical Use Cases

- **内容运营 / Content Operations**  
  - 批量采集专题相关文章并统一润色；  
  - 自动导出正文 HTML + 已压缩图片，用于 CMS 或公众号排版。

- **编辑与作者 / Editors & Writers**  
  - 从多篇参考资料中提取核心内容，让 AI 帮忙重组结构与语言风格；  
  - 使用自定义提示词生成不同语气和篇幅的版本。

- **团队知识库维护 / Knowledge Management**  
  - 把外部文章快速转化为内部知识库条目；  
  - 统一图片尺寸与命名规则，方便后续检索与复用。

---

## 🔧 配置与扩展 / Configuration & Extensibility

- `.env.example` 中展示了可选的环境变量，例如：
  - `IMAGE_SAVE_PATH`：图片处理后的默认保存路径；  
  - `HTTP_PROXY` / `HTTPS_PROXY`：访问受限网站时使用的代理。
- 复制为 `.env.local` 并按需修改，即可自定义本地运行参数。  
- 应用内的「通用设置」面板可进一步调节：
  - 图片目标宽度、质量、格式；  
  - 代理地址与常用端口预设；  
  - 默认提示词与当前使用的提示词配置。

---

## ❓ 常见问题 / FAQ

- **Q: 会不会把内容上传到第三方服务器？**  
  **A:** 文章解析与图片处理在你本机进行，模型调用只发往你所配置的 API 服务商（如 DeepSeek、OpenAI、自定义兼容服务）。

- **Q: 团队成员需要自己装 Node.js 吗？**  
  **A:** 是的，首次使用需要安装 Node.js。之后只要双击 `启动应用.bat` 即可。

- **Q: 如何修改端口或代理？**  
  **A:** 端口可在 `server.ts` 中调整，代理可在应用的「通用设置 → 代理配置」中修改，或在 `.env.local` 中设置。

---

## 📜 许可证 / License

本项目由 **小龙 (Xiaolong)** 开发，采用 **CC BY‑NC‑SA 4.0** 许可协议：

- **禁止商用 / Non‑Commercial** – 不得用于商业用途；  
- **相同方式共享 / ShareAlike** – 衍生作品需以相同协议开源；  
- **保留署名 / Attribution** – 使用或改造时需保留“小龙 (Xiaolong)”的署名与许可说明。

查看仓库中的 `LICENSE` 文件以了解完整条款。  
See the `LICENSE` file for full license text.

---

## ✉️ 联系方式 / Contact

- 作者 / Author: **小龙 (Xiaolong)**  
- 仓库 / Repo: `https://github.com/chenklein26-maker/Articleflow`  
- 如有问题、建议或使用反馈，欢迎通过 GitHub Issues 提交，一起让 Article Flow 变得更好用。


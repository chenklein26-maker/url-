## Article Flow

从任意 URL 提取文章、AI 润色、批量处理图片的桌面工具。

### 快速开始

```bash
git clone <仓库地址>
cd ArticleFlow
npm install
npm run dev    # 浏览器模式，或 npm run start 启动桌面版
```

可选：复制 `.env.example` 为 `.env.local` 可配置代理、图片保存路径等，详见文件内说明。

### 团队快速上手（内部同事）

- **安装环境**
  - 安装 Node.js 18+（推荐从 `https://nodejs.org/` 下载）
- **首次运行**
  - 在项目目录执行：
    ```bash
    npm install
    npm run dev
    ```
  - 终端看到 `Server running on http://localhost:3000` 后，在浏览器打开 `http://localhost:3000`
- **配置 API Key（重要）**
  - 启动应用后，在界面的「通用设置 → AI 模型配置」中：
    - 选择 DeepSeek / GPT-4o / 自定义 OpenAI 兼容 API
    - 填写自己的 API Key（不要把 Key 写进 `.env.local` 再打包给别人）
- **基本使用流程**
  - 在左侧输入框粘贴要处理的文章 URL（每行一个）
  - 点击「添加链接」→「一键同步处理」
  - 等待完成后：
    - 右侧可复制生成的 HTML
    - 图片会按设置好的规则保存到你选择的文件夹

### 功能特性

- **文章提取**：输入 URL，自动抓取正文内容与图片
- **AI 润色**：支持 DeepSeek、GPT-4o、自定义 OpenAI 兼容 API
- **提示词库**：多套润色规则，可备份/导入
- **图片处理**：自动缩放、格式转换、重命名
- **文件夹监控**：实时监控指定目录，自动处理新图片
- **代理支持**：可配置 HTTP/HTTPS 代理访问受限网站

### 环境要求

- **Node.js 18+**（推荐 20+）
- Windows / macOS

### 本地运行

#### 1. 安装依赖

```bash
npm install
```

#### 2. 启动应用

浏览器模式（开发/调试）：

```bash
npm run dev
```

Electron 桌面版：

```bash
npm run start
```

或直接双击 `启动应用.bat`。

#### 3. 访问

- 浏览器模式：`http://localhost:3000`
- 桌面版：自动弹出应用窗口

### API Key 配置

启动应用后，在界面中的「通用设置 → AI 模型配置」里：

- 选择模型（DeepSeek / GPT-4o / 自定义）
- 为对应提供商填写 API Key

> 建议每位同事使用自己的 Key，不要把 Key 写进 `.env.local` 再打包给别人。

### 打包分发（桌面应用）

生成 Windows 安装包：

```bash
npm run electron:build
```

构建产物输出在 `release/` 目录：

- `.exe` 安装程序
- `win-unpacked` 便携版目录

### 常见问题

- **端口 3000 已被占用**  
  修改 `server.ts` 里的 `PORT`，或关闭占用该端口的程序。

- **访问某些网站失败**  
  在「通用设置 → 代理配置」中填入代理地址（例：`http://127.0.0.1:7890`）。

- **AI 调用失败**  
  检查 API Key 是否正确，是否需要代理，或是否达到调用频率/额度限制。

### 许可证

本项目采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh) 许可协议：

- **禁止商用**：不得将本作品用于商业目的
- **相同方式共享**：基于本作品创作的衍生作品必须以相同许可协议发布，并保持开源
- **署名**：使用或二次创作时须保留署名并注明许可协议

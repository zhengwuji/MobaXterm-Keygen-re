# MobaXterm Keygen · 离线增强版 (MobaXterm-Keygen-re)

> 纯本地、完全离线运行的 MobaXterm 激活密钥生成与 Customizer 配置深度合并工具。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Web%20%7C%20CLI-success)](#)
[![Offline](https://img.shields.io/badge/Network-100%25%20Offline-brightgreen)](#)

---

## ✨ 核心特性

- **🔒 100% 纯本地离线**：所有静态资源（Tailwind、Vue、JSZip、FileSaver、字体）全量内嵌，**零外部网络请求**，数据绝不上传，安全透明。
- **📦 单文件极速版 (`MobaXtermKeygen.html`)**：将 HTML、CSS、JS 完全内联打包为单个文件，直接双击（`file://` 协议）即可运行，无需启动任何服务器环境。
- **💎 现代磨砂玻璃 UI**：暗色/亮色自适应主题无缝切换，动态流光背景，优雅动效。
- **🔍 Pro.key 逆向解析验签**：生成或上传 `.mxtpro` 后，自动反向解密并显示明文授权详情（授权版本、用户名、目标版本号、授权人数），真伪一目了然。
- **✍️ 灵活版本号支持**：
  - **完全支持手动自由输入**任意版本号（如 `26.5`、`21.0` 等）。
  - 提供常见主流版本快捷填入按钮（`26.5 最新`、`26.4`、`25.2`、`24.4`、`24.0`、`21.0`），点选即可自动填充。
- **🧩 Customizer 深度合并器**：
  - 一键将生成的授权与 `.\MobaXterm.exe -customizer` 导出的 `.custom` 个性化包（定制图标、默认配置、插件）合并为最终的 `Custom.mxtpro`。
  - 自动修复并补齐目录条目，兼容各类解压环境。
- **🚀 一键部署与排错辅助**：
  - 支持调用现代浏览器文件保存 API（`showSaveFilePicker`）直接选择覆盖安装目录。
  - 内置一键复制 PowerShell 部署指令与旧版许可证缓存清理命令，彻底避免 `Custom (1).mxtpro` 重命名失活问题。
- **🐍 跨平台命令行工具 (`keygen.py`)**：
  - 标准 Python 脚本（仅依赖原生库），支持许可证生成、`--merge` 批量合并以及 `--inspect` 逆向检查。

---

## 🚀 快速上手

### 方式 1：本地服务启动（推荐）

双击项目根目录的 `start.bat`，或者在 PowerShell 中运行：

```powershell
powershell -ExecutionPolicy Bypass -File launch.ps1 start
```

服务就绪后会自动弹出浏览器打开 `http://127.0.0.1:8899/index.html`。

* 查看运行状态：双击 `status.bat`
* 停止本地服务：双击 `stop.bat`
* 重启本地服务：双击 `restart.bat`

---

### 方式 2：单文件免安装运行

直接双击打开项目中的 **`MobaXtermKeygen.html`** 文件。
完全依靠浏览器原生引擎执行，不依赖任何本地服务或外部网络连接。

---

### 方式 3：Python 命令行版

无需依赖第三方库，Python 3.6+ 直接运行：

```bash
# 生成默认许可证 (Professional / defaultUser / 21.0)
python keygen.py

# 自定义参数生成
python keygen.py -t 1 -u alice -n 5 -M 26 -m 5 -o Custom.mxtpro

# 与 Customizer 导出的设置包合并
python keygen.py -u bob -M 26 -m 5 --merge "MobaXterm customization.custom" -o Custom.mxtpro

# 逆向解析已有许可证
python keygen.py --inspect Custom.mxtpro
```

---

## 📖 部署与激活说明

1. 将生成的 `Custom.mxtpro` 复制放置在 MobaXterm 安装目录（与 `MobaXterm.exe` 同级目录）：
   ```text
   C:\Program Files (x86)\Mobatek\MobaXterm\Custom.mxtpro
   ```
2. **常见排错（若提示未激活）**：
   - 确认文件名严格为 `Custom.mxtpro`，不能出现系统自动编号如 `Custom (1).mxtpro`。
   - 删除旧的 `Custom.mxtpro`。
   - 清理缓存：打开 `%APPDATA%\MobaXterm\MobaXterm.ini`，删除其中的 `[License]` 段和 `ProKey=...` 配置，然后重新启动 MobaXterm。

---

## 🛠️ 项目结构

```text
├── index.html               # 主入口页面
├── MobaXtermKeygen.html     # 单文件打包成品（开箱即用）
├── keygen.py                # Python 命令行生成、合并与验签工具
├── server.mjs               # 零依赖本地轻量静态 HTTP 服务器
├── launch.ps1               # PowerShell 启动守护与进程管理脚本
├── start.bat / stop.bat     # Windows 快速双击控制批处理
├── build_single_file.mjs    # 单文件自动化内联构建脚本
├── src/
│   ├── app.js               # 前端核心业务响应式逻辑
│   ├── app.css              # 离线样式与 Aurora 动态背景
│   └── mergeZipFiles.js     # Zip 合并器与反向解密算法
├── site/                    # 本地化离线依赖库 (Tailwind, Vue, JSZip, FileSaver)
└── tests/                   # 自动化与端到端回归校验
```

---

## ⚖️ 免责声明

本项目仅供个人学习、网络安全与软件逆向工程技术研究交流使用。
商业环境请前往 [MobaXterm 官网](https://mobaxterm.mobatek.net/) 购买官方正版商业授权。

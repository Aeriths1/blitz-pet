

# Blitz Boy

[English](README.md) | **中文**

一只住在 macOS 桌面上的排线手绘 Blitzcrank。指向屏幕上任意一句话，他出钩把这句抓回来，结合上下文在头顶的思考气泡里解释它。


https://github.com/user-attachments/assets/1b2523f6-3937-454e-80dd-0217b19cf739



<p align="center">
  <img src="docs/media/grab-sentence.gif" width="49%" alt="短按抓一句">
  <img src="docs/media/grab-paragraph.gif" width="49%" alt="长按抓一段">
</p>
<p align="center">
  <img src="docs/media/idle-sneeze.gif" width="24%" alt="打喷嚏">
  <img src="docs/media/idle-snatch.gif" width="24%" alt="抓鼠标">
  <img src="docs/media/idle-dash.gif" width="24%" alt="冲刺">
  <img src="docs/media/idle-doodle.gif" width="24%" alt="画画">
</p>

- **指哪抓哪**：网页、PDF、编辑器、终端、聊天窗口，连视频画面里的字都能抓。
- **短按一句，长按一段**：按住蓄力，进度圈转满就抓整段。
- **带上下文**：解释时会一并参考所在 App、窗口标题和前后文。
- **桌宠本色**：看鼠标、挥手、冒蒸汽；拎起来乱晃，甩出去会撞墙反弹；没人理时像老式 DVD 屏保一样满屏飘。

## 系统要求

| 项目 | 要求 |
|---|---|
| 系统 | **macOS 13 Ventura 及以上**（只支持 Mac；取词依赖 macOS 的辅助功能接口和 Vision 文字识别） |
| 芯片 | Apple Silicon 和 Intel 都支持，下载时选对应的安装包 |
| Claude Code | 已安装并登录。解释由本机的 `claude -p` 生成（见“模型配置”）；没装时出钩、待机动画照常，只是不出解释 |

## 安装

1. 下载 [Releases](https://github.com/Aeriths1/blitz-pet/releases/latest) 里的安装包：M 系列芯片选 `arm64`，Intel 选 `x64`。
2. 打开安装包，把 Blitz Boy 拖进“应用程序”。
3. 第一次打开被拦时，去 **系统设置 › 隐私与安全性**，拉到底点“仍要打开”。

### 从源码运行

需要 Node.js 18 及以上和 Xcode Command Line Tools（`xcode-select --install`）。

```bash
git clone https://github.com/Aeriths1/blitz-pet.git blitz-pet
```

```bash
cd blitz-pet && npm install
```

```bash
npm run build:native
```

```bash
npm start
```

自己打安装包：`npm run dist`，产物在 `dist/`。

## 权限

在 **系统设置 › 隐私与安全性** 里，给运行 Blitz 的程序开两项权限：装了安装包的是 **Blitz Boy**；用 `npm start` 运行时是 `node_modules/electron/dist/Electron.app`，名字显示为 **Electron**。

| 权限 | 用途 | 没开时 |
|---|---|---|
| **辅助功能** | 读取指针下文字的原文、位置和前后文 | 只能靠截屏识字，速度慢一些，偶有错字 |
| **屏幕与系统录音** | 截屏识字（视频画面、图片、不开放文字的 App） | 只能抓开放文字的 App |

两项都没开时，Blitz 退回抓剪贴板里的文字。开完权限后重启 Blitz。

## 模型配置

解释调用本机的 Claude Code（`claude -p`），用的是你自己的 Claude Code 登录和额度，不需要另填 API key。默认设置在项目根目录的 **`config.json`**；装了安装包的话，把要改的项写进 **`~/Library/Application Support/Blitz Boy/config.json`**（只写要改的项即可，它会覆盖默认值；从源码运行时也生效）：

```json
{
  "model": "claude-opus-5-5",
  "effort": "low",
  "claudeBin": "",
  "configDir": ""
}
```

| 字段 | 含义 | 可选值 |
|---|---|---|
| `model` | 用哪个模型解释 | `claude-opus-5-5`（默认，最强）、`claude-sonnet-5-5`（更快）、`claude-haiku-5-5`（最快、最省） |
| `effort` | 思考力度，越高越慢 | `low`（默认）、`medium`、`high` |
| `claudeBin` | Claude Code 可执行文件的路径；留空时自动查找 | 例如 `/opt/homebrew/bin/claude` |
| `configDir` | Blitz 专用的 Claude Code 配置目录，里面存着它自己的登录，所以可以和终端用不同的账号；留空时和终端共用同一个登录 | 默认留空 |

- 改完保存即可，下一次出钩就生效，不用重启。
- `claudeBin` 留空时，按以下顺序查找：Claude 桌面版自带的 CLI → `~/.local/bin/claude` → `/opt/homebrew/bin/claude` → `/usr/local/bin/claude` → `PATH` 里的 `claude`。
- 要让 Blitz 用单独的账号，把 `configDir` 设成例如 `~/.claude-blitz`，再给 Blitz 单独登录一次（只需一次）：在终端运行 `CLAUDE_CONFIG_DIR=~/.claude-blitz claude`，输入 `/login` 登录要给 Blitz 用的账号，登录后退出即可。终端里平常的 `claude` 不受影响。
- 环境变量优先于 `config.json`：`BLITZ_MODEL`、`BLITZ_EFFORT`、`CLAUDE_BIN`、`BLITZ_CLAUDE_CONFIG_DIR`。例如临时换模型：

```bash
BLITZ_MODEL=claude-haiku-5-5 npm start
```

- 调用时不加载你的 hooks、插件、MCP、CLAUDE.md 和工具，只发提示词。
- 系统设置了代理而终端没有时，会自动沿用 macOS 的系统代理。

### 发给模型的内容

| 内容 | 来源 |
|---|---|
| 被抓的句子或段落 | 指针所在处 |
| 上下文 | 网页取整页正文；普通文本取前后约 2000 字；截屏识字时取同一窗口里的文字。以句子为中心，最多约 6000 字 |
| App 名和窗口标题 | 指针所在的窗口 |

截屏只在瞄准时拍一张，识字后立即删除，不保存。

## 用法

| 操作 | 效果 |
|---|---|
| 点一下 Blitz，或按 **⌥Q** | 进入瞄准：射道从他手臂指向鼠标，指到的句子盖上红色排线 |
| 瞄准时**短按** | 出钩，抓这一句 |
| 瞄准时**按住约半秒** | 蓄力，进度圈转满后抓整段 |
| 瞄准时按 **Esc** 或**右键** | 收起钩子 |
| 思考气泡里的 **复制** / **✕** | 复制解释 / 关闭气泡 |
| 按住 Blitz 拖动 | 拎起来；松手甩出去，撞墙反弹后落地 |
| 鼠标停在 Blitz 身上 | 看你、挥手，久一点会转天线冒蒸汽 |
| 右键点 Blitz | 打开他自己的菜单：待机动画、装饰，以及语言（默认跟随系统，可在这里切换中英文，解释也跟着换） |
| Blitz 45 秒没人理（鼠标没碰他） | 在原地画一幅小画，其余时候在原地做小动作 |
| 5 分钟电脑没人操作（键盘鼠标都没动） | 才会离开原地：起飞满屏飘（撞到屏幕角落会庆祝）、玩跳跳、冲刺、沿屏幕底部溜达；鼠标碰到他就落回地面 |

### 菜单栏

| 菜单项 | 作用 |
|---|---|
| 隐藏 / 显示 Blitz Boy（⌃⇧H） | 把他藏起来或叫回来 |
| 出钩抓一句（⌥Q） | 进入瞄准 |
| 回到右下角 | 从屏幕顶上掉回右下角 |
| 待机时自己玩（飘 / 跳） | 开关待机漂移和跳跳 |
| 现在就飘 | 立刻起飞 |
| 玩 Doodle Jump | 鼠标左右控制，Esc 结束 |
| 看他自己跳 | 他自己玩一局 |
| 待机动画 | 点名播放某个小动作：听歌、打碟、弹吉他、唱歌、拉小提琴、画画等 |
| 装饰 | 戴耳机、戴墨镜，可分别勾选 |
| 退出 | 退出 Blitz |

按 **⌃⇧E** 播放入场动画：他戴着墨镜从屏幕底下飞上来。

## 取词方式

按以下顺序，取到为止：

1. **辅助功能**（`native/ax-at`）：直接读 App 里的原文和每个字的位置，约 0.1 秒。原生文本、Safari、Chrome、Electron 应用（Obsidian、VS Code、Cursor）都可以。
2. **截屏识字**（`native/ocr`，Apple Vision）：读不到原文时使用，例如视频里的字、图片、PDF 跨行的段落。整屏识别约 0.8 秒；首次运行要加载识别模型，会慢一些。
3. **剪贴板**：两项权限都没有时使用。

Electron 应用和 Chrome 默认不开放网页里的文字，Blitz 抓取时会替它们打开辅助功能模式（和开启 VoiceOver 时相同）。

## 目录

```
main.cjs            透明窗口、菜单栏、快捷键、截屏、取词、调用模型
preload.cjs         页面与主进程之间的接口
index.html          样式与思考气泡
config.json         模型配置
src/blitz.mjs       桌宠行为、钩子、绘制
src/acts.mjs        待机小动作
src/text.mjs        截屏识字结果的拼段与断句
src/claude.cjs      调用 Claude Code
src/pen.mjs         排线笔触
src/sound.mjs       钩子音效（出钩、蓄力）
native/ax-at.swift  辅助功能取词
native/ocr.swift    Vision 截屏识字
assets/             Blitz 的 SVG 部件、菜单栏图标与音效
```

## 声明

Blitzcrank 是 Riot Games《英雄联盟》中的角色。本项目为非官方同人作品，与 Riot Games 无关，未经 Riot Games 认可，免费、非商业。Blitz 的排线画风为本项目原创绘制。

`assets/sfx/` 里的音效为本项目原创，用 [earshot](https://github.com/Leonxlnx/earshot)（MIT）的代码合成音效叠混而成，不含任何录音或游戏音效，来源见 `assets/sfx/SOURCES.md`。

## 许可证

代码、原创手绘与音效以 [MIT](LICENSE) 许可发布。Blitzcrank 角色形象不在许可范围内，版权归 Riot Games 所有。

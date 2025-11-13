# 特别感谢OpenAI，是GPT-5全权编写了代码和本README

# NGA 自动 BGM（自动播放与随滚动切换）

在 NGA 论坛（`bbs.nga.cn`）的帖子中，对作者插入的 BGM 进行： 

- 自动播放（遵循浏览器策略，默认静音可自动播放）
- 随滚动自动切换当前播放的视频（页面最上方区域不播放）
- 提供悬浮控制面板（启停自动切换、静音、音量、上一段/下一段、定位当前）
- 支持快捷键：A 切换自动、M 切换静音、←/→ 上一段/下一段、L 定位当前

## 一键安装

安装浏览器脚本管理器（推荐 Tampermonkey 或 Violentmonkey）后，点击以下链接即可安装脚本：

- 一键安装脚本（Raw）：https://raw.githubusercontent.com/sudaoer/nga_auto_bgm/master/nga_auto_bgm.user.js

备用（GitHub Raw）：

- https://github.com/sudaoer/nga_auto_bgm/raw/master/nga_auto_bgm.user.js

> 说明：安装后访问 https://bbs.nga.cn/ 的帖子页即可生效。

- 我知道有人在用别的nga域名，但是有人要我加再加吧

## 使用说明

1. 打开任意 NGA 帖子页面，等待脚本加载完成。
2. 页面右下角会出现「NGA Auto BGM」面板：
	- 自动切换：根据滚动位置切换当前播放的视频；
	- 静音：是否静音播放；
	- 音量：调节默认音量；
	- ◀/▶：上一段/下一段；定位：滚动定位到当前播放的视频；
3. 快捷键支持：
	- A：开关自动切换；M：静音开关；
	- ←/→：上一段/下一段；L：定位到当前。

## 兼容性与权限

- 测试环境：除了作者使用的edge，都没测过。
- 匹配站点：`https://bbs.nga.cn/*`

## 变更日志

- v0.1.2：优化首次播放起点、滚动同步与控制面板体验。

## 反馈与贡献

仓库地址：https://github.com/sudaoer/nga_auto_bgm

欢迎通过 Issue/PR 反馈问题、提交改进建议。


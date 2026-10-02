# 田园主题素材

根据用户选定的 `docs/product/reference-commercial-ui.png`，独立生成背景与透明角色、牌面、组件图集，并按 `manifest.json` 语义键接入实际游戏。效果图没有被裁切作为运行界面。

- `home.png`、`board.png`：首页及对局背景。
- `characters.png`：卧姿、欢呼、普通、草帽、围巾、墓碑、三项荣誉。
- `tiles.png`：15 种农场牌面。
- `components.png`：叶枝、进度星、牌框。
- `primary.png`：细金色边框的黄色主按钮。
- `fonts/ZCOOLKuaiLe-Regular.ttf`：站酷快乐体，来自 Google Fonts；授权见同目录 `OFL.txt`。

PNG 原文件保留完整，图集通过清单中的 rect 裁切；运行时文字、棋盘、点击区域和统计由代码绘制。后续替换方法见 `docs/product/正式素材替换.md`。图集不是从第三方商业游戏包提取的素材；这份说明不为仓库其它历史资料授予新的许可。

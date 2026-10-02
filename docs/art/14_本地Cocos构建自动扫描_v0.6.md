# 本地 Cocos 构建自动扫描 v0.6

新增：`extraction_tools/scan_cocos_build.py`。

它会读取 Cocos Creator 打包后的：
- `config*.json`
- `import/`
- `native/`

自动输出：
- `resource_file_index.csv`
- `spriteframes.csv`
- `block_spriteframes.csv`
- `reward_spriteframes.csv`
- `rank_spriteframes.csv`
- `spine_assets.json`
- `scan_report.json`

## Windows
```bat
扫描本地Cocos构建.cmd D:\path\to\assets\resources D:\output
```

## 价值
后续如果找到另一份 2022 历史构建，不再靠人工一张张找文件；可以直接扫描两个构建并做差异对比，判断哪些牌面、羊皮肤、道具和 UI 是首周已有，哪些是后续版本新增。

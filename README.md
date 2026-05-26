# PDF to Obsidian Manually

打开 `index.html` 后上传 PDF，在预览区使用方形框选工具标记重要文字、图形和表格。工具栏会固定在页面左侧，便于处理长图纸时随时切换。

导出的 zip 包包含：

- Markdown 文件
- `assets/figures` 图形截图
- `assets/tables` 表格截图
- `assets/text` 扫描文字区域截图
- `manifest.json` 圈选坐标清单

使用删除工具后，点击任意已框选区域即可单独删除该区域。

文字内容会优先从 PDF 文本层提取，并按框选区域与文字边界的交集判断。扫描件没有文本层时，会尝试使用浏览器端 OCR 识别；如果仍未识别成功，会保留对应截图。

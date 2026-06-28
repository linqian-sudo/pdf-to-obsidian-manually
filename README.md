# PDF to Obsidian Manually

一个面向 Obsidian 的 PDF 手动整理工具。上传 PDF 后，可以用方形框选工具标记重要文字、图形和表格，并导出 Markdown 与附件。

## 功能

- PDF 页面预览
- 方形框选：重要文字、图形、表格
- 删除工具：点击已框选区域即可单独删除
- 导出 Obsidian zip 包
- 浏览器端 OCR 兜底
- OCR 只处理已框选的文字/表格区域，不默认解析整份 PDF
- 每个文字框选区域都会保存原始截图到 `assets/text`

## 框选 OCR 工作流

1. 上传 PDF。
2. 用文字、表格、图形工具框选真正需要进入笔记的区域。
3. 点击“解析已框选区域”，只对文字和表格框选区域做 OCR。
4. 导出 Obsidian zip 包。

导出的 Markdown 只包含人工框选过的内容，不会把整份 PDF 的无用信息写进去。

## OpenDataLoader PDF 后端

`backend/` 文件夹提供 Node.js 后端，使用官方 OpenDataLoader PDF 项目作为解析器。

- GitHub: https://github.com/opendataloader-project/opendataloader-pdf
- npm: `@opendataloader/pdf`

后端接口：

- `GET /api/health`
- `POST /api/parse`

要求：

- Node.js 20+
- Java 11+，推荐 JDK 17

本地启动：

```bash
cd backend
npm install
npm start
```

前端默认后端地址：

```text
http://127.0.0.1:8787
```

如果 `java -version` 显示 Java 8，需要先升级到 JDK 17，否则 OpenDataLoader PDF 无法运行。

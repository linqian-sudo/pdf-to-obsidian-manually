# PDF to Obsidian Manually

一个面向 Obsidian 的 PDF 手动整理工具。上传 PDF 后，可以用方形框选工具标记重要文字、图形和表格，并导出 Markdown 与附件。

## 功能

- PDF 页面预览
- 方形框选：重要文字、图形、表格
- 删除工具：点击已框选区域即可单独删除
- 导出 Obsidian zip 包
- 浏览器端 OCR 兜底
- 可选 OpenDataLoader PDF 后端解析整份 PDF

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

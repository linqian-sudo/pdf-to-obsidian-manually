# PDF to Obsidian Manually Backend

This service receives PDF uploads from the web app and parses them with
OpenDataLoader PDF.

Official parser:

- GitHub: https://github.com/opendataloader-project/opendataloader-pdf
- npm: `@opendataloader/pdf`

## Requirements

- Node.js 20+
- Java 11+; Java 17 is recommended

Check Java:

```bash
java -version
```

## Local Run

```bash
cd backend
npm install
npm start
```

The API will listen on:

```text
http://127.0.0.1:8787
```

## API

Health check:

```bash
curl http://127.0.0.1:8787/api/health
```

Parse a PDF:

```bash
curl -F "pdf=@document.pdf" http://127.0.0.1:8787/api/parse
```

The response includes:

- `markdown`: OpenDataLoader Markdown output
- `json`: OpenDataLoader structured output with bounding boxes
- `files`: generated output file list

## Docker

```bash
docker build -t pdf-to-obsidian-backend .
docker run --rm -p 8787:8787 pdf-to-obsidian-backend
```

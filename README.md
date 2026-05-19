# ספר המתכונים

Hebrew-language PWA for managing family recipes — scanned cards, PDFs, dish photos, nested categories, fast search. Local-first (IndexedDB) with planned Google Drive sync.

## Live site

https://yairbear-ship-it.github.io/recipe-book/

## Local development

```bash
npm install
npm run dev
```

## Build for production

```bash
GITHUB_PAGES=true npm run build
```

Deployment to GitHub Pages happens automatically on every push to `main` via `.github/workflows/deploy.yml`.

## Stack

- Vite + React + TypeScript
- Tailwind CSS (RTL Hebrew layout)
- Dexie (IndexedDB) for offline-first storage
- HashRouter (static-host friendly)

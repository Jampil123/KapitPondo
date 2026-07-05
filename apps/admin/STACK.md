# apps/admin — Tech Stack & Structure

## Status
This app is currently just the default Vite + React + TypeScript starter scaffold (`App.tsx` still renders the template's "Hello Tailwind" / counter / docs-links demo content). No routing, no real admin screens, and no Supabase wiring have been built yet — `@supabase/supabase-js` is installed as a dependency but not yet imported anywhere in `src`.

## Tech Stack

| Layer | Choice | Version |
|---|---|---|
| UI library | React | ^19.2.6 |
| Language | TypeScript | ~6.0.2 |
| Build tool / dev server | Vite | ^8.0.12 |
| Vite React plugin | @vitejs/plugin-react | ^6.0.1 |
| Styling | Tailwind CSS (via `@tailwindcss/vite` plugin) | ^4.3.1 |
| CSS post-processing | PostCSS + Autoprefixer | ^8.5.15 / ^10.5.0 |
| Backend client | @supabase/supabase-js | ^2.108.2 |
| Linting | ESLint + typescript-eslint | ^10.3.0 / ^8.59.2 |
| ESLint plugins | eslint-plugin-react-hooks, eslint-plugin-react-refresh | ^7.1.1 / ^0.5.2 |

No router (React Router, TanStack Router, etc.), state-management library, or component/UI kit is installed — everything here is stock Vite scaffolding plus Tailwind and the Supabase client dependency.

### Scripts (`package.json`)
- `dev` — `vite` (dev server with HMR)
- `build` — `tsc -b && vite build` (typecheck then production build)
- `lint` — `eslint .`
- `preview` — `vite preview` (serve the production build locally)

## Folder Structure

```
apps/admin/
├── README.md              # default Vite template readme (unmodified)
├── STACK.md               # this file
├── eslint.config.js       # flat ESLint config (js + react-hooks + react-refresh)
├── index.html             # Vite entry HTML, mounts #root, loads src/main.tsx
├── package.json
├── tsconfig.json           # references tsconfig.app.json + tsconfig.node.json
├── tsconfig.app.json        # app-side TS config (src/**)
├── tsconfig.node.json       # node-side TS config (vite.config.ts)
├── vite.config.ts          # registers @vitejs/plugin-react + @tailwindcss/vite
├── public/                 # static assets served as-is
└── src/
    ├── main.tsx             # React root entry — mounts <App /> in StrictMode
    ├── App.tsx              # top-level component (still default template content)
    ├── App.css              # component-level styles for the template demo
    ├── index.css            # global styles / Tailwind entry
    └── assets/
        ├── hero.png
        ├── react.svg
        └── vite.svg
```
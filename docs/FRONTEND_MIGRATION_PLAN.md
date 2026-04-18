# Frontend Migration Plan: Mantine UI + Vite 5 + PWA + Tailwind CSS v4

**Date:** 2026-04-19  
**Branch:** mobile-compatibility  
**Scope:** `client/` directory only — server unchanged

---

## Audit Summary

### Current Stack

| Concern | Current | Target |
|---|---|---|
| Bundler | Vite 4.1 | Vite 5+ |
| React | 18.2.0 | 18.x (unchanged) |
| Language | JSX (no TypeScript) | JSX (TS optional later) |
| CSS | Tailwind CSS v3.2 | Tailwind CSS v4 |
| Component library | @headlessui/react v2 | @mantine/core v7 |
| Icons | @heroicons/react | @tabler/icons-react |
| Forms | react-hook-form v7 | @mantine/form |
| Charts | recharts v3 | @mantine/charts (wraps recharts) |
| HTTP client | axios | unchanged |
| Router | react-router-dom v6 | unchanged |
| Utilities | classnames | clsx |
| PWA | none | vite-plugin-pwa |

### App Scale
- 11 React Contexts (auth, roles, permissions, devices, etc.) — unchanged
- 6 custom permission hooks — unchanged
- ~30 page components across Dashboard, Admin, Reports, Billing, DeviceTesting
- Layout: Header + Sidebar + Layout — high-impact migration targets
- Custom theme: Inter font, purple primary (`#6B46C1`)

---

## Compatibility Checklist

| Check | Status | Notes |
|---|---|---|
| React 18 | ✓ | Mantine v7 requires React 18 |
| Vite | ✓ | Native support, needs `@tailwindcss/vite` plugin |
| No TypeScript | ✓ | Mantine ships types but doesn't require TS |
| Tailwind v3 → v4 | Breaking | CSS-first config, no `tailwind.config.js`, new `@import` syntax |
| react-hook-form | Parallel | Migrate forms last — API differences require care |
| recharts | ✓ | `@mantine/charts` wraps it, knowledge transfers |
| 11 Contexts | ✓ | Unrelated to UI library — zero changes needed |

---

## Migration Phases

### Phase 1 — Vite Upgrade + PWA (zero UI changes)

**Why first:** Vite 4→5 is mostly non-breaking for this setup. PWA is purely additive.

```bash
cd client

# Upgrade Vite + React plugin
npm install --save-dev vite@^5.4 @vitejs/plugin-react@^4.3

# PWA plugin
npm install --save-dev vite-plugin-pwa workbox-window
```

**`vite.config.js` — updated:**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Genvolt IoT Dashboard',
        short_name: 'Genvolt',
        description: 'IoT Device Monitoring & Management',
        theme_color: '#6B46C1',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // API calls — network first, fall back to cache
            urlPattern: /^https?:\/\/.*\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 300 },
              networkTimeoutSeconds: 10,
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ],
  base: '/',
  build: { outDir: 'dist' },
  server: { port: 3002, host: 'localhost', open: true }
})
```

**PWA icons:** Add `pwa-192x192.png` and `pwa-512x512.png` to `client/public/`.  
Use [pwa-asset-generator](https://github.com/elegantapp/pwa-asset-generator) or Maskable.app to generate them.

**Test PWA locally:**
```bash
npm run build && npm run preview
# DevTools → Application → Service Workers
```

---

### Phase 2 — Install Mantine + Tailwind v4 (no UI changes yet)

Install both side-by-side, verify no import conflicts before touching any component.

```bash
# Mantine core + ecosystem
npm install @mantine/core @mantine/hooks @mantine/form @mantine/notifications @mantine/charts
npm install @mantine/dates dayjs

# PostCSS plugin required by Mantine
npm install --save-dev postcss-preset-mantine postcss-simple-vars

# Tailwind v4 (replaces v3)
npm install --save-dev tailwindcss@^4 @tailwindcss/vite

# Mantine-native icons
npm install @tabler/icons-react

# Better classname utility
npm install clsx
```

**`postcss.config.js` — updated:**
```js
export default {
  plugins: {
    'postcss-preset-mantine': {},
    'postcss-simple-vars': {
      variables: {
        'mantine-breakpoint-xs': '36em',
        'mantine-breakpoint-sm': '48em',
        'mantine-breakpoint-md': '62em',
        'mantine-breakpoint-lg': '75em',
        'mantine-breakpoint-xl': '88em'
      }
    },
    autoprefixer: {},
  }
}
```

**`vite.config.js` — add Tailwind v4 plugin:**
```js
import tailwindcss from '@tailwindcss/vite'
// add tailwindcss() to the plugins array
```

**`src/styles/index.css` — Tailwind v4 replaces the three `@import` directives:**
```css
@import "tailwindcss";
@import "@mantine/core/styles.css";
@import "@mantine/notifications/styles.css";
@import "@mantine/charts/styles.css";

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

/* Tailwind v4: custom theme tokens via CSS (replaces tailwind.config.js) */
@theme {
  --color-primary-50: #f3f4f6;
  --color-primary-100: #e5e7eb;
  --color-primary-500: #6B46C1;
  --color-primary-600: #553C9A;
  --color-primary-700: #4C1D95;
  --color-primary-800: #3B0764;
  --color-primary-900: #2D1B69;
  --font-sans: 'Inter', system-ui, sans-serif;
}

body {
  font-family: 'Inter', sans-serif;
}

/* Prevent iOS Safari from zooming on input/select focus */
@media screen and (max-width: 768px) {
  input, select, textarea {
    font-size: 16px !important;
    touch-action: manipulation;
  }
}

.login-container {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
}
```

> **Style conflict note:** Mantine uses `--mantine-color-*` CSS variables. Tailwind v4 uses `--color-*`. They don't clash. Import Mantine styles before Tailwind to let Tailwind's reset apply last.

After this phase: `npm run dev` should still work identically. No visible UI change.

---

### Phase 3 — Theme + MantineProvider in `main.jsx`

Wrap the app with `MantineProvider` without touching any component. This makes Mantine's CSS variables available globally.

**`src/main.jsx`:**
```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import App from './App'
import './styles/index.css'

const theme = createTheme({
  primaryColor: 'violet',
  primaryShade: { light: 6, dark: 7 },
  fontFamily: 'Inter, system-ui, sans-serif',
  colors: {
    brand: [
      '#f3f4f6', '#e5e7eb', '#d1d5db', '#9ca3af', '#6B7280',
      '#6B46C1', '#553C9A', '#4C1D95', '#3B0764', '#2D1B69'
    ],
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MantineProvider theme={theme}>
      <Notifications position="top-right" />
      <App />
    </MantineProvider>
  </React.StrictMode>
)
```

**Dark mode:**
```jsx
// OS-level auto detection
<MantineProvider defaultColorScheme="auto" theme={theme}>

// Manual toggle via useLocalStorage from @mantine/hooks
```

Extract the theme object to `src/theme/index.js` as it grows.

---

### Phase 4 — Component Migration (parallel, page by page)

#### Migration order (least risky → most risky)

| Order | Target | Risk | Notes |
|---|---|---|---|
| 1 | `LoadingSpinner` | Low | Replace with Mantine `Loader` |
| 2 | `StatusBadge` | Low | Replace with Mantine `Badge` |
| 3 | `Modal` | Medium | Mantine `Modal` has similar API |
| 4 | `AccessDeniedModal` | Medium | Same as above |
| 5 | `SearchableSelect` | Medium | Mantine `Select` with `searchable` prop |
| 6 | `Header` / `Sidebar` / `Layout` | High | Use Mantine `AppShell` |
| 7 | Login page | Low | Isolated, no shared state |
| 8 | Admin pages | Medium | Tables, inputs, forms |
| 9 | Dashboard pages | Medium | Charts, metrics cards, tables |

#### Parallel coexistence pattern

Keep old component, create new one alongside it:
```
src/components/common/
  Modal.jsx           ← old (keep until all consumers migrated)
  Modal.mantine.jsx   ← new Mantine version
```
Update one consumer at a time. When all consumers are updated: delete old file, rename `.mantine.jsx` → `.jsx`.

#### Key component mappings

**Dialog/Modal:**
```jsx
// BEFORE (@headlessui)
import { Dialog } from '@headlessui/react'
<Dialog open={open} onClose={setOpen}>...</Dialog>

// AFTER (Mantine)
import { Modal } from '@mantine/core'
<Modal opened={open} onClose={() => setOpen(false)} title="...">...</Modal>
```

**Combobox/Select:**
```jsx
// BEFORE (@headlessui)
import { Combobox } from '@headlessui/react'

// AFTER (Mantine)
import { Select } from '@mantine/core'
<Select searchable data={options} value={value} onChange={setValue} />
```

**Status badge:**
```jsx
// BEFORE (classnames)
import cn from 'classnames'
<span className={cn('px-2 py-1 rounded', active ? 'bg-green-100' : 'bg-gray-100')}>

// AFTER (Mantine)
import { Badge } from '@mantine/core'
<Badge color={active ? 'green' : 'gray'} variant="light">{label}</Badge>
```

**Layout (AppShell):**
```jsx
import { AppShell, Burger } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'

const [opened, { toggle }] = useDisclosure()

<AppShell
  navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
  header={{ height: 60 }}
>
  <AppShell.Header>
    <Burger opened={opened} onClick={toggle} hiddenFrom="sm" />
    {/* header content */}
  </AppShell.Header>
  <AppShell.Navbar>{/* sidebar content */}</AppShell.Navbar>
  <AppShell.Main>{children}</AppShell.Main>
</AppShell>
```

#### Components Mantine doesn't cover

| Component | Recommendation |
|---|---|
| Complex data tables with sorting/pagination | Add `mantine-datatable` (community) or keep custom |
| Real-time IoT charts | `@mantine/charts` covers it (wraps recharts) |
| Custom IoT visualizations | Keep custom |

---

### Phase 5 — Form Migration to @mantine/form

**API mapping from react-hook-form:**

```jsx
// BEFORE (react-hook-form)
const { register, handleSubmit, formState: { errors } } = useForm()

<form onSubmit={handleSubmit(onSubmit)}>
  <input {...register('email', { required: true })} />
  {errors.email && <span>Required</span>}
</form>

// AFTER (@mantine/form)
const form = useForm({
  initialValues: { email: '' },
  validate: {
    email: (v) => (/^\S+@\S+$/.test(v) ? null : 'Invalid email')
  }
})

<form onSubmit={form.onSubmit(onSubmit)}>
  <TextInput {...form.getInputProps('email')} label="Email" />
  {/* Error display is automatic — built into TextInput */}
</form>
```

**Strategy:** Migrate one admin page at a time. Form logic is self-contained per page, making this safe to do incrementally. Do not start until Phase 4 (components) is at least 80% complete.

---

### Phase 6 — Cleanup

After all pages are migrated:

```bash
npm uninstall @headlessui/react @heroicons/react react-hook-form classnames
```

- Delete `tailwind.config.js` (Tailwind v4 no longer uses it)
- Rename all `.mantine.jsx` parallel files to `.jsx`
- Remove unused PostCSS config entries

---

## Recommended Folder Structure

```
client/src/
├── components/
│   ├── common/          # shared UI primitives (Badge, Modal, Spinner, etc.)
│   ├── dashboard/       # dashboard-specific components
│   ├── layout/          # Header, Sidebar, Layout (AppShell)
│   └── modals/          # modal components
├── context/             # unchanged — all 11 contexts stay
├── hooks/               # unchanged — permission hooks stay
├── pages/               # route-level pages
│   ├── Admin/
│   ├── Billing/
│   ├── Dashboard/
│   ├── DeviceTesting/
│   ├── Login/
│   └── Reports/
├── services/            # axios API calls — unchanged
├── styles/
│   └── index.css        # single CSS entry (Tailwind v4 + Mantine imports)
├── theme/
│   └── index.js         # Mantine createTheme() — extracted from main.jsx
└── utils/               # unchanged
```

---

## Performance & Mobile

### Bundle optimization

```js
// vite.config.js — manual code splitting
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'mantine': ['@mantine/core', '@mantine/hooks'],
        'charts': ['@mantine/charts', 'recharts'],
        'router': ['react-router-dom'],
      }
    }
  }
}
```

### Lazy-load heavy admin pages

```jsx
// App.jsx
const UserManagement = React.lazy(() => import('./pages/Admin/UserManagement'))
const InventoryManagement = React.lazy(() => import('./pages/Admin/InventoryManagement'))
// wrap routes in <Suspense fallback={<LoadingSpinner />}>
```

### Mobile-first responsive layout

```jsx
// Mantine responsive grid
<Grid>
  <Grid.Col span={{ base: 12, sm: 6, lg: 4 }}>...</Grid.Col>
</Grid>

// Responsive display
<Box visibleFrom="sm">Desktop only</Box>
<Box hiddenFrom="sm">Mobile only</Box>
```

### Core Web Vitals checklist

| Metric | Action |
|---|---|
| LCP | Self-host Inter font instead of Google Fonts CDN |
| CLS | Set explicit height on chart containers |
| INP | Lazy-load admin pages with React.lazy() |
| Loading states | Use Mantine `Skeleton` instead of full-page spinners |
| Bundle size | Enable Vite's `manualChunks` splitting (above) |

---

## PWA Caching Strategy Summary

| Resource type | Strategy | Rationale |
|---|---|---|
| JS/CSS/HTML/fonts | CacheFirst (via globPatterns) | Static assets — content-hashed, safe to cache forever |
| API calls (`/api/*`) | NetworkFirst, 10s timeout | Prefer fresh data, fall back to cache when offline |
| Google Fonts CSS | StaleWhileRevalidate | Fast load + background refresh |
| Google Fonts files | CacheFirst, 1yr expiry | Font binaries never change for a given URL |

---

## Risk Areas

| Risk | Mitigation |
|---|---|
| Tailwind v4 breaking changes | Migrate CSS config before touching components; test build after Phase 2 |
| MantineProvider missing upstream | Add to `main.jsx` in Phase 3 before any Mantine component is used |
| react-hook-form → @mantine/form API diff | Migrate forms last (Phase 5); run both in parallel if needed |
| AppShell layout breaking on mobile | Test on real device during Phase 4 Layout migration |
| Service worker caching stale API data | Use NetworkFirst with short maxAgeSeconds for all API routes |

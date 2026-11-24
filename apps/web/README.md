# goalong-mui-starter

 (theme Minimal UI v6 บน MUI v5) ไม่มี business module  

- Stack: React 18 + TypeScript + Vite 5 + MUI v5 / MUI X v7 + react-router v6
- มีให้: theme ทั้งชุด (palette / typography / shadows / component overrides / dark mode),
  settings drawer (โหมดสี, contrast, RTL, preset สีหลัก, ฟอนต์), design-system components,
  RHF + zod form wrapper (`Field.*`), i18n (th / en)
- **ไม่มี**: dashboard layout, sidebar nav, auth, axios/SWR, business module — เพิ่มเองตาม project

หน้า `/` คือหน้า demo สำหรับตรวจ theme — ลบ `src/pages/demo` + `src/sections/demo` ได้เมื่อเริ่มงานจริง

 

| ที่ | แก้อะไร |
|---|---|
| `package.json` | `name`, `description` |
| `index.html` | `<title>` |
| `src/config-global.ts` | `CONFIG.site.name` (ใช้ใน `<Helmet>` ของทุกหน้า) |
| `.env` | `VITE_BASE_PATH` (ถ้า deploy ใต้ sub-path), `VITE_SERVER_URL` |
| `public/logo/logo-single.svg`, `logo-full.svg` | โลโก้ — `src/components/logo/logo.tsx` อ่านจาก `/logo/logo-single.svg` |
| `public/favicon.ico` | favicon |

 

มี 2 ชั้น:

1. **ค่า default ของแบรนด์** — `src/theme/core/colors.json` key `primary`
   ต้องมีครบ `lighter / light / main / dark / darker / contrastText` และเป็น hex 6 หลัก
   (`hexToRgbChannel` ใน `src/theme/styles/utils.ts` จะ throw ถ้าไม่ใช่)
2. **preset ที่ผู้ใช้เลือกได้ใน drawer** — `src/theme/with-settings/primary-color.json`
   เพิ่ม preset ใหม่ต้องแก้ 3 ที่: json นี้, `PRIMARY_COLORS` ใน `with-settings/update-theme.ts`,
   type `SettingsState['primaryColor']` ใน `src/components/settings/types.ts`
   และ options ใน `settings/drawer/settings-drawer.tsx`

สี semantic อื่น (`secondary / info / success / warning / error / grey`) อยู่ใน `colors.json` เดียวกัน
 

- ฟอนต์ default: `defaultFont` ใน `src/theme/core/typography.ts` (ตอนนี้ `Kanit`)
- ไฟล์ฟอนต์โหลดผ่าน `@fontsource/*` ใน `src/global.css` — เพิ่มฟอนต์ใหม่ต้อง `yarn add @fontsource/<name>`
  แล้ว `@import` น้ำหนัก 400-800 ใน `global.css`
- รายการที่ผู้ใช้เลือกได้ใน drawer: prop `options` ของ `<FontOptions>` ใน `settings-drawer.tsx`
  (ชื่อต้องตรงกับ font-family ที่โหลดไว้ ไม่งั้นจะ fallback เป็น system font เงียบ ๆ)

 

1. เพิ่ม path ใน `src/routes/paths.ts`
2. `lazy(() => import('src/pages/<x>'))` แล้วใส่ใน `children` ของ `src/routes/sections/index.tsx`
3. `src/pages/<x>/index.tsx` ทำแค่ `<Helmet>` + render view
4. UI จริงอยู่ที่ `src/sections/<x>/view.tsx`

pattern นี้เหมือน CRM — ถ้าจะเอา `DashboardLayout` + `nav-section` มาใช้ ให้ copy จาก
`go-crm-24v4/src/layouts` และ `src/components/nav-section` (ผูกกับ `routes/hooks` + auth context)
 

- ปุ่มเปิด: `<SettingsButton />` จาก `src/components/settings`
- ซ่อน option ที่ไม่ใช้: `<SettingsDrawer hideNavLayout hideNavColor hideCompact />` (ตั้งไว้แล้วใน `app.tsx`
  เพราะ starter ไม่มี layout) — ถ้าเพิ่ม DashboardLayout ค่อยเอา prop ออก
- ค่าเก็บใน localStorage key `app-settings` (ค่า default ที่ `settings/config-settings.ts`)
  และ `theme-mode` (light/dark) — key เดียวกับ CRM จึง copy ค่าข้ามกันได้

 

- สีใช้ผ่าน `theme.vars.palette.*` หรือ string key ใน `sx` (`'text.secondary'`, `'primary.main'`)
  ห้าม hardcode hex ใน component
- โปร่งใสใช้ `varAlpha(theme.vars.palette.grey['500Channel'], 0.24)` จาก `src/theme/styles`
  ห้าม `alpha()` ของ MUI (ไม่ทำงานกับ CSS vars)
- เงาใช้ `theme.customShadows.z8 / card / dialog / dropdown / primary ...`
- dark mode ใช้ `[stylesMode.dark]: { ... }` ใน `sx`
- รายละเอียดเต็ม + component catalog: [docs/design-system.md](docs/design-system.md)

 

| กลุ่ม | component |
|---|---|
| พื้นฐาน | `Iconify`, `FlagIcon`, `SvgColor`, `Label`, `Logo`, `Image`, `Scrollbar` |
| overlay | `CustomPopover` + `usePopover`, `ConfirmDialog`, `toast` (snackbar), `ProgressBar`, `LoadingScreen` / `SplashScreen` |
| navigation | `CustomBreadcrumbs`, `CustomTabs` |
| ตาราง | `useTable`, `TableHeadCustom`, `TablePaginationCustom`, `TableNoData`, `TableEmptyRows`, `TableSelectedAction`, `TableSkeleton` |
| ฟอร์ม | `Form` + `Field.Text / TextNumber / Select / MultiSelect / Autocomplete / DatePicker / MobileDateTimePicker / Checkbox / Switch / RadioGroup / Slider / Rating / Code / Phone / PhoneThai / CountrySelect / SelectIcon`, `schemaHelper` |
| อื่น ๆ | `ComponentBox`, `EmptyContent`, `SearchNotFound`, `animate/*` (`MotionLazy`, `varFade`, ...), `color-utils` |

hooks: `useBoolean`, `useResponsive`, `useLocalStorage`, `useSetState`, `useTabs`, `useDebounce`,
`useCopyToClipboard`, `useEventListener`, `useScrollToTop`

### Add-on จาก CRM (ไม่ได้นำมาเพราะลาก dependency หนัก)

| component | copy จาก `go-crm-24v4/src/components/` | ต้องติดตั้ง | ต้องแก้ |
|---|---|---|---|
| upload (+ `Field.Upload*`) | `upload`, `file-thumbnail`, `lightbox`, `hook-form/rhf-upload.tsx` + `src/assets/illustrations` + `public/assets/icons/files` | `react-dropzone`, `yet-another-react-lightbox` | ถอด import `src/sections/component/previewpdfurl` ใน `upload.tsx`; variant Employee/Cmp/Signature ใน `rhf-upload.tsx` ผูก `CONFIG.site.serverUrl` |
| editor (+ `Field.Editor`) | `editor`, `hook-form/rhf-editor.tsx` | `@tiptap/*`, `lowlight` | ถอด import `src/hooks/store/marketing/store-reqform` |
| chart | `chart` + `@import './components/chart/styles.css'` ใน `global.css` | `apexcharts`, `react-apexcharts` | — |
| markdown | `markdown` | `react-markdown`, `rehype-highlight`, `rehype-raw`, `remark-gfm` | — |
| carousel | `carousel` | `embla-carousel*` | — |
| map | `map` + styles.css | `mapbox-gl`, `react-map-gl` | ต้องมี `VITE_MAPBOX_API_KEY` |

เพิ่มแล้วอย่าลืม export กลับเข้า `hook-form/fields.tsx` และ `hook-form/index.ts`

##  ภาษา (i18n)

- รองรับ `th` (default) และ `en` — ไฟล์ที่ `src/locales/langs/<lang>/{common,navbar,translation}.json`
- namespace `translation` ใช้โดย component กลาง (`btncancel`, `txtrowperpage`, `msgnotfound` ...) อย่าลบ key เหล่านี้
- เพิ่มภาษา: เพิ่ม entry ใน `all-langs.ts` (พร้อม MUI locale), `LanguageValue` + `languages` + `changeLangMessages`
  ใน `config-locales.ts`, `dayjs/locale/<x>` ใน `localization-provider.tsx`, และโฟลเดอร์ `langs/<x>/`
- CRM โหลดคำแปลจาก API — starter ใช้ไฟล์ static (`i18n-provider.tsx`) ถ้าต้องการแบบ API ดู `langsfomdb.ts` ใน CRM

## 10. สคริปต์

```bash
yarn dev          # dev server 8081 (vite-plugin-checker รัน tsc + eslint แสดง overlay)
yarn dev:host     # เปิดให้เครื่องอื่นในวงเข้าถึง
yarn build        # tsc && vite build → dist/ (production drop console/debugger)
yarn lint         # eslint (airbnb + perfectionist — import order เข้มงวด)
yarn lint:fix
yarn fm:fix       # prettier
yarn test         # jest (ts-jest, node env)
```


- `fontWeightBold: '550'` และ h3/h4 weight 550 ใน `typography.ts` — look ของ Kanit ใน CRM
- ค่า contrast `'hight'` (สะกดผิดตั้งแต่ต้น) ใน `settings/types.ts`, `update-theme.ts` — ค่าใน localStorage ของผู้ใช้ CRM ใช้คำนี้
- `useLocalStorage.removeStorage` ใช้ `sessionStorage` — ปุ่ม Reset ใน drawer จึงไม่ล้าง `app-settings` ทันที (quirk เดิม)
- `src/theme` ↔ `src/components/settings` import กันไปมา (เฉพาะ type + constant) — ทำงานได้ อย่าจัด export ใหม่
- `@mui/lab`, `@mui/x-data-grid`, `@mui/x-date-pickers`, `@mui/x-tree-view` ต้องอยู่ใน deps แม้ไม่ได้ render
  เพราะ `theme-provider.tsx` ใช้ type augmentation ของทั้ง 4 ตัว

สิ่งที่ต่างจาก CRM โดยตั้งใจ: ฟอนต์ Sarabun โหลดจริง (CRM list ไว้แต่ไม่โหลด), ตัด Tahoma Sans และ Barlow ออก

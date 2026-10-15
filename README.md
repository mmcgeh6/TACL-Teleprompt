# TACL Teleprompt

A mobile-first teleprompter in The AI Consulting Lab design system. You can paste or write a script and set it to scroll at a fixed speed, or switch to voice follow and let it keep pace as you read. You can also change the size and colors and mirror or flip the text for any rig.

## Features

- **Scripts library**: create, paste, import `.txt`, search, duplicate, delete. Autosaves as you type.
- **Auto scroll**: adjustable speed, 3/5/10s countdown, and time-remaining readout. Drag with your finger at any time to adjust.
- **Voice follow**: listens through the mic, matches your words to the script, and scrolls to keep your place on the reading line. Words you've read dim. If you scroll by hand, it picks up from there.
- **Display**: text size, line spacing, side margins, left or center alignment, all caps, color presets (Classic, TACL, Daylight, Sunglow, Soft, Green) plus custom text and background colors.
- **Orientation**: mirror (horizontal flip) for beam-splitter glass, and vertical flip for screens that face up or are mounted upside down. Use both together to get a 180° rotation.
- **Reading line**: a marker that sits at any height you choose.
- **Rig friendly**: keeps the screen awake, supports full screen, installs as an app, and works offline. Works with Bluetooth page-turner remotes and keyboards (Space, arrows, PgUp/PgDn, Home, H, V, +/−).

Display settings are saved per device, since each phone or tablet in a rig usually needs its own setup.

## Install as an app (PWA)

The app is a Progressive Web App. Once installed, it gets a home-screen icon, opens full screen without browser bars, and keeps working offline.

- **iPhone / iPad (Safari):** tap Share, then **Add to Home Screen**. The library shows this tip on iOS until you dismiss it.
- **Android / desktop Chrome or Edge:** tap **Install app** in the header, or use the browser menu's **Install** option.

Offline, everything runs from the cached app, including scripts saved on the device. Scripts synced through Supabase need a connection to load. Voice follow also needs a connection, because speech recognition runs on Google's or Apple's servers. Updates install automatically: a new deploy is picked up the next time the app is opened.

The service worker only runs in production builds. To test it locally, run `npm run build` and then `npm run preview`.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173. Without Supabase settings, scripts are stored in this browser only.

## Saving scripts to a database (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run [supabase/schema.sql](supabase/schema.sql). It creates the `scripts` table with row-level security, so each person sees only their own scripts.
3. In **Authentication → URL Configuration**, set **Site URL** to your deployed URL (for example `https://your-app.netlify.app`) and add it under **Redirect URLs**.
4. Optional: to allow signing in with a 6-digit code as well as the email link (handy when the app is installed to an iPhone home screen), open **Authentication → Emails → Magic Link** and add `{{ .Token }}` to the template.
5. Copy **Project URL** and the **anon public** key from **Project Settings → API** into the environment variables below.

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<project>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the anon public key |

With these set, the app asks you to sign in by email. You can still skip sign-in and keep scripts on the device. Any scripts already saved on the device can be moved to your account after you sign in.

## Deploy to Netlify

1. Push this repo to GitHub, then **Add new site → Import an existing project** in Netlify.
2. Build settings come from `netlify.toml` (build `npm run build`, publish `dist`).
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Site configuration → Environment variables**, then redeploy.

## Deploy to Replit

1. Import the GitHub repo into Replit. The `.replit` file runs the dev server on port 5173.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in **Secrets**.
3. Click **Deploy** and choose **Static**. The deployment config builds with `npm run build` and serves `dist`.

## Notes on voice follow

- Voice follow uses the browser's built-in speech recognition. It works in **Chrome** (Android, desktop) and **Safari** (iPhone, iPad). Firefox does not support it.
- It needs HTTPS, which Netlify and Replit provide, plus microphone permission.
- Chrome sends audio to Google's speech service to transcribe it, and Safari uses Apple's. Script text never leaves the device for this.
- Pick the spoken language in **Display → Scrolling** if you don't read in your browser's default language.

# Wordbook Mobile

Expo (React Native) app for Wordbook. It talks to the **same NestJS API and MongoDB** as the
web app (`D:\English`), so accounts, words, the library and settings are shared between web and phone.

## Server

The app uses the API deployed on Render: `https://english-be-ys8a.onrender.com/api`
(set in `.env` for development and in `eas.json` for builds). The free Render plan sleeps after
15 minutes without traffic, so the first request after that can take up to a minute.

## Run on your phone (development)

1. `npm install`, then `npm start` and scan the QR code with **Expo Go**.
2. To use an API running on this PC instead, set `EXPO_PUBLIC_API_URL=http://<PC LAN IP>:3000/api` in `.env`
   (phone and PC on the same Wi-Fi, port 3000 allowed through the firewall). Plain `http://` only works in
   Expo Go / development builds, not in the release APK.

> Expo runs on port **8082** here (see `package.json`), because McAfee Agent already uses 8081
> on the office PC.

## Build an APK (EAS)

```bash
npx eas-cli@latest login            # your Expo account
npx eas-cli@latest build -p android --profile preview
```

The `preview` profile in `eas.json` builds an installable `.apk` pointed at the Render API.
When the build finishes, EAS shows a link/QR code to download the APK onto the phone.

Android package name: `com.wordbook.app` (change it in `app.json` before publishing to Google Play;
it can't be changed afterwards).

## Structure

- `src/app/` — screens (Expo Router). `(tabs)/` = Home, Library, Words, Practice; plus word detail,
  add/edit form, library word, review (flashcards), quiz, settings, login.
- `src/state/store.tsx` — app data and actions (same logic as the web app's state).
- `src/lib/` — API client (`api.ts`, token in secure storage), shared types/helpers (`data.ts`, copied
  from the web app), design tokens (`theme.ts`), icons, speech.
- `src/components/` — UI pieces rebuilt from the web design.

## Checks

```bash
npx tsc --noEmit

npx expo-doctor
```

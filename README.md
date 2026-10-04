# Wordbook Mobile

Expo (React Native) app for Wordbook. It talks to the **same NestJS API and MongoDB** as the
web app (`D:\English`), so accounts, words, the library and settings are shared between web and phone.

## Run on your phone (development)

1. Start the API (`D:\English_BE`): `npm run start:dev`.
2. Put your PC's LAN address in `.env` (phone and PC must be on the same Wi-Fi):
   ```
   EXPO_PUBLIC_API_URL=http://192.168.71.242:3000/api
   ```
   `localhost` does not work from a phone — it means the phone itself.
3. Allow port **3000** through Windows Firewall (inbound TCP) so the phone can reach the API.
4. `npm install`, then `npm start` and scan the QR code with **Expo Go**.

> Expo runs on port **8082** here (see `package.json`), because McAfee Agent already uses 8081
> on this PC.

## Build an APK (EAS)

```bash
npx eas-cli@latest login            # your Expo account
npx eas-cli@latest build -p android --profile preview
```

The `preview` profile in `eas.json` builds an installable `.apk` and sets `EXPO_PUBLIC_API_URL`.
When the build finishes, EAS shows a link/QR code to download the APK onto the phone.

**Before building for real use**, deploy the API somewhere public with HTTPS and change
`EXPO_PUBLIC_API_URL` in `eas.json` to that address. A LAN address like `http://192.168.x.x`
only works while the phone is on the same network as this PC.
Plain `http://` is allowed in the build (`usesCleartextTraffic` in `app.json`) for testing on a LAN;
once the API has HTTPS you can remove that.

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
npx expo lint
npx expo-doctor
```

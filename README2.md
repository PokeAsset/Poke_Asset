# PokéAsset

Pokémon card portfolio tracker built with Expo + React Native + TypeScript.

## Run it

    npm install
    npx expo start

Press `i` for the iOS simulator, or scan the QR code with Expo Go.

## Not real yet

- Assistant: `answer()` in `src/screens/Assistant.tsx` is a local stub.
- Card scan, sealed scan, PokéGrade: photo capture works, recognition needs a backend.
- Marketplace listings are on-device only.
- Menu pages without screenshots are placeholders.

## Before the App Store

- Change `ios.bundleIdentifier` in `app.json`.
- Add `icon` and `splash` assets.
- Build with EAS: `npx eas build -p ios`.

# Dawomix / Nextrack2

Mobilní DJ knihovna jako PWA a nativní Android aplikace přes Capacitor.

## Android APK

Požadavky: Node.js 22, Java 21 a Android SDK.

```bash
npm ci
npm run android:apk
```

Výsledný instalační soubor je v:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Workflow **Android APK** na GitHubu sestaví stejný soubor automaticky a uloží ho jako artefakt `Dawomix-debug-apk`.

Pro otevření projektu v Android Studiu použijte:

```bash
npm run android:open
```

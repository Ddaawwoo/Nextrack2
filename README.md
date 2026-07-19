# Hot Cue Lab

Mobilní webová aplikace ve vizuálním duchu Nextrack2, zaměřená na automatické vytváření čtyř DJ hot cue bodů podle waveformu.

## Funkce

- lokální načtení MP3, WAV, M4A nebo OGG
- vykreslení waveformu v prohlížeči
- automatická detekce 4 výrazných cue bodů
- heuristika založená na RMS energii a změnách nástupu
- nastavitelná citlivost a minimální rozestup bodů
- ruční posun cue markerů přímo na waveformu
- okamžité přehrávání od vybraného cue bodu
- mobilní PWA a offline základ přes service worker

## Spuštění

```bash
npm install
npm start
```

Analýza audia probíhá pouze v zařízení. Skladba se nikam neodesílá.

## Stav

První funkční prototyp. Další vhodný krok je přesnější beat-grid/onset detekce přes Essentia.js a export cue bodů do Rekordbox XML.

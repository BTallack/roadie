# Music Assistant on Stream Deck

An Elgato Stream Deck plugin for [Music Assistant](https://www.music-assistant.io): playback
controls per player, now-playing artwork, and keys that load your playlists. It talks straight
to your own Music Assistant server over its WebSocket API; nothing goes through any other
service.

Early days: the plan is in [docs/PLAN.md](docs/PLAN.md) and what the API allows in
[docs/music-assistant-api.md](docs/music-assistant-api.md). The connection layer works;
keys are next.

## Requirements

- Stream Deck app 7.1 or later, macOS 12+ or Windows 10+.
- Music Assistant with user accounts (API schema 28 or later; 2.10 and up is what's tested),
  reachable from this computer (same network or VPN).
- A long-lived token: in Music Assistant, Settings, Profile, "Long-lived access tokens".
  A dedicated user with the guest role is enough to control players and load playlists.

## Develop

Needs Node 24.

```bash
npm install
npm test                                              # unit tests against a fake Music Assistant
MA_URL=192.168.1.10 MA_TOKEN=... npm run probe        # read-only dump of a real server
npm run build
npx streamdeck dev                                    # once: developer mode
npx streamdeck link media.tallack.musicassistant.sdPlugin
npm run watch                                         # rebuilds and restarts the plugin on save
```

The settings panels use a local copy of [sdpi-components](https://sdpi-components.dev), so
they load no code from the internet.

## Licence

MIT. Music Assistant is a separate project, licensed under Apache 2.0; this plugin isn't
affiliated with it.

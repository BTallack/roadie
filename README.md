# Roadie for Music Assistant

Your [Music Assistant](https://www.music-assistant.io) players on an Elgato Stream Deck:
now playing with artwork, play/pause, skip, stop, volume, and keys that load your playlists.
Roadie talks straight to your own Music Assistant server over its WebSocket API; nothing goes
through any other service. It isn't an official Music Assistant project.

## Keys

| Key | Shows | Press |
|---|---|---|
| Now playing | Artwork, title and artist, a state dot, a progress bar that keeps moving | Play / pause. On a Stream Deck+ dial: turn for volume |
| Play / Pause | Play while paused or idle, pause while playing; grey when the player can't | Toggles |
| Next / Previous | Skip glyph, lit while something is playing or paused | Skips |
| Stop | Stop glyph, lit while something is playing or paused | Stops |
| Volume | One of five, chosen in settings: volume up, volume down, mute (yellow while muted), the current level on an arc, or the level with press-to-mute | Steps, mutes, or nothing for the display-only level. On a dial: turn for volume, press to mute |
| Playlist | The playlist's artwork and name; framed green while the player plays from it, yellow while paused on it | Loads it on the player: replace the queue, play now, play next, or add to the end; shuffle on, off or as the server is set |

Every key names its player, shown as a small line at the top unless "Hide player name" is
ticked; glyph keys can also drop their caption word, and the now-playing key its title and
artist. A new key starts with the settings the last key was given (player, hide switches,
volume mode, enqueue mode), so a row of keys for one room takes one pick.
Group players (Sonos sync groups, Music Assistant groups) work like any other, with the
group's volume. Players on another source (Spotify Connect, line-in) show what the player
reports and take the commands it supports.

The plan and what's next are in [docs/PLAN.md](docs/PLAN.md); what the API allows is in
[docs/music-assistant-api.md](docs/music-assistant-api.md).

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
MA_URL=192.168.1.10 MA_TOKEN=... npx tsx scripts/preview.ts [player…]   # draws every key into .preview/
npm run build
npx streamdeck dev                                    # once: developer mode
npx streamdeck link media.tallack.roadie.sdPlugin
npm run watch                                         # rebuilds and restarts the plugin on save
npx streamdeck validate media.tallack.roadie.sdPlugin
npx streamdeck pack media.tallack.roadie.sdPlugin     # .streamDeckPlugin for distribution
```

The settings panels use a local copy of [sdpi-components](https://sdpi-components.dev), so
they load no code from the internet.

## Licence

MIT. Music Assistant is a separate project, licensed under Apache 2.0; this plugin isn't
affiliated with it.

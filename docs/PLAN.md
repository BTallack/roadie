# Music Assistant on Stream Deck: plan

A Stream Deck plugin that controls [Music Assistant](https://www.music-assistant.io) players
and loads playlists, talking straight to the user's own server over its WebSocket API. Open
source, on GitHub, in the spirit of Music Assistant itself. The Culm for Bambuddy plugin
(`../culm-streamdeck`) is the pattern: one shared server connection, keys drawn as SVG from
live state, a settings panel that sets the server once for every key.

What the API allows and forbids is in [music-assistant-api.md](music-assistant-api.md).
Short version: everything on the wishlist is possible, live, with artwork, on a LAN or VPN;
Music Assistant's remote-access id is not usable and the server has to be typed in (or
found by mDNS later).

## Status

- 25 Sep 2026, afternoon: research done, project scaffolded, connection layer tested.
- 25 Sep 2026, evening: named **Roadie for Music Assistant** (UUID `media.tallack.roadie`).
  Phases 1 to 3 built: session layer, all seven keys (Now playing key and dial, Play/Pause,
  Next, Previous, Stop, Volume key and dial, Playlist), three settings panels, icons.
  16 tests pass against a fake server; `scripts/preview.ts` draws every key from the real
  one; `streamdeck validate` is clean apart from the repo URL not existing yet. Linked into
  Brennan's Stream Deck app for a first try. Not done from the v1 list: "Selected on this
  deck" (phase 2 item, deferred to phase 4), shuffle/repeat/power keys, marketplace polish.
- Brennan's server: Music Assistant 2.10.4 (schema 65), Home Assistant add-on,
  `http://192.168.1.10:8095`. 17 players (Sonos, three sync groups), 98 playlists across
  Spotify, Apple Music, Plex and Music Assistant's own.

What the probe taught us, folded into the code:

- Sonos players report no `power` feature and are always "on", so a Power key is pointless
  for this house; it stays a later option for players that have it.
- Sync-group players list no `pause` or `next_previous` feature, but their queue takes all
  transport commands. So a key trusts the queue when Music Assistant is the source and only
  checks features for native sources (`canTransport` in `shared.ts`).
- A queue is `active` even while idle; it means Music Assistant is the player's source.
- The image proxy needs no token and rejects sizes other than 0/80/160/256/512/1024.
- The same playlist name appears from several providers (Spotify and Apple Music copies of
  "Hamilton"), so the picker shows the provider's name after each.
- Group players carry `group_volume` instead of `volume_level`; the volume key uses
  `group_volume`, `group_volume_up/down` for them.
- Clock offset between this Mac and the server is 2 ms; the `time` heartbeat keeps it.

## Keys

| Key | Shows | Press | On a Stream Deck+ dial |
|---|---|---|---|
| Now playing | Artwork, title, artist; state colour; a progress bar moving between updates | Play / pause | Strip: art + title + progress. Turn: volume. Push/tap: play / pause |
| Play / Pause | Play glyph while paused or idle, pause glyph while playing; grey when the player can't (no `pause` feature, external source that can't pause) | Toggles | |
| Next track / Previous track | Glyph; grey when the source can't skip | Skips | |
| Stop | Stop glyph; lit while playing or paused | Stops | |
| Volume | Level as an arc with the number; muted state; up / down / mute chosen in settings | Steps by the server's step, or mutes | Turn: volume, push: mute |
| Playlist | The playlist's artwork with its name; lit while the player's queue was loaded from it; grey while the player is off or unavailable | Loads it on the chosen player with the chosen enqueue mode and shuffle | |

Later, same machinery, different picker: Album, Radio station, Artist radio, Favourites,
Shuffle toggle, Repeat cycle, Power, Group / ungroup, Transfer queue here, Announcement.

Every key names its player. A second option, "Selected on this deck", follows a shared
player choice set by the Now playing dial (turn with the dial pressed, or a dedicated Player
key), so one row of transport keys can serve whichever room the user last picked. Every key
can hide the player name (as in the Bambuddy plugin), and glyph keys can drop their caption.

Players offered in the picker: `enabled`, not `private`, not `hide_in_ui` (with a "show
hidden players" switch), sorted by name, groups and stereo pairs marked. Unavailable players
stay in the list so a key set up while a speaker was off still works when it's back.

## Architecture

```
src/
  plugin.ts            registers actions, wires global settings and wake-ups to the session
  shared.ts            the one Session, connection summary for the panel, helpers
  ma/
    types.ts           the API model slices the plugin reads            (done)
    connection.ts      one WebSocket: handshake, auth, commands, events (done, tested)
    session.ts         state and reconnects: players, queues, playlists, artwork cache
  actions/
    base.ts            PlayerAction: visible keys, redraw on change, player picker, placeholders
    nowplaying.ts  playpause.ts  next.ts  previous.ts  stop.ts  volume.ts  playlist.ts
  render.ts            SVG key images at 144 px; strip layouts for dials
scripts/probe.ts       read-only dump of a real server                (done)
test/                  node:test against a fake Music Assistant (ws)  (connection done)
media.tallack.roadie.sdPlugin/
  manifest.json  ui/*.html  ui/sdpi-components.js  imgs/
```

Session (`ma/session.ts`), carrying over the Bambuddy fleet's lessons:

- Global settings: `url`, `token`. Reconfigure is a no-op when nothing changed.
- Connect: `GET /info` first so a wrong address or a server still in setup reads as its own
  message, then the socket. "Live" means the auth answer arrived, not that the socket opened.
- After auth: `players/all`, `player_queues/all`, then live from `player_updated`,
  `queue_updated`, `queue_time_updated`, `player_added/removed`. Playlists are loaded on
  demand for the picker and refreshed on `media_item_*` events for URIs keys use.
- Reconnect on close with backoff (1 s doubling to 30 s), immediately on system wake, and a
  `time` round-trip every 30 s as a heartbeat (two misses = reconnect). An auth error stops
  retrying and tells the panel the token is wrong; a network error keeps retrying.
- Progress moves between events from `elapsed_time` + `elapsed_time_last_updated`, corrected
  by the clock offset the `time` command gives.
- Commands go through one `run()` that shows the key's tick or alert, maps error code 9
  (unsupported) and 12 (invalid) to a grey key rather than an alert loop, and logs.
- Artwork: fetched from `/imageproxy/{proxy_id}?size=160` (or `image_url` /
  `remotely_accessible` path), cached in memory by URL with a small LRU, embedded in the
  key SVG as base64 like the camera key does.

Settings panels (`ui/`), reusing the Bambuddy panel's server section and styling:

- `player.html`: player picker (+ "Selected on this deck"), hide-name / hide-caption, server
  section. Used by Now playing, Play/Pause, Next, Previous, Stop.
- `volume.html`: the above plus mode (up / down / mute; ignored on a dial) and, later, step.
- `playlist.html`: the above plus a playlist picker with a search box (the list is fetched
  with `search` so ten-thousand-playlist libraries stay usable), "favourites only" switch,
  enqueue mode (Replace, default; Play now; Play next; Add to end), shuffle (server default /
  on / off).
- Server section: address (host or host:port, 8095 assumed), token (password field),
  status line, "Test" that calls `/info`, and a note on where to make a token
  (Settings, Profile, Long-lived access tokens) and the recommended guest-role user.

Privacy: the token lives in Stream Deck's global settings; logging stays at info (trace
would log settings messages, which carry the token); the plugin talks to one host only.

## Phases

1. **Transport keys.** `session.ts`, `base.ts`, `render.ts`, Play/Pause, Next, Previous,
   Stop, Volume (keys only), the `player.html` and `volume.html` panels, fake-server tests
   for the session (reconnect, event handling, command redirection). Installable and usable
   on Brennan's deck against the real server.
2. **Now playing, artwork.** The key and the dial strip, progress that moves, the artwork
   cache, the "Selected on this deck" player and the dial's volume.
3. **Playlist key.** The picker with search and favourites, enqueue and shuffle options,
   lit-while-playing from `queue.sources`, artwork. `media_item_*` refresh.
4. **Dials, extras.** Volume dial, shuffle and repeat, power. Album / radio / favourites keys
   if wanted (same base as the playlist key).
5. **Ship.** Icons (category, marketplace, per action), README with screenshots from a
   preview script like Bambuddy's (`scripts/preview.ts`, key images from the real server),
   `streamdeck validate` and `pack`, GitHub Actions running `npm test` and validate, public
   repo, a first release, and a note to the Music Assistant community.

Stretch: mDNS discovery in the panel, group / ungroup and transfer keys, announcements,
a multi-state Play/Pause using Stream Deck's own state images for users who want their own
icons.

## Decisions to make

1. **Name and id.** Manifest says "Roadie for Music Assistant", UUID `media.tallack.roadie`,
   repo `egs-music-assistant`. Elgato's Marketplace can bounce names that lead with another
   product's trademark, and the Music Assistant project may prefer we don't look official.
   Options: keep it, or a Culm-style own name with "for Music Assistant" after it.
2. **Licence.** MIT is scaffolded. Music Assistant itself is Apache 2.0; either is fine for
   a client, MIT is shorter.
3. **"Selected on this deck".** Worth doing in phase 2 (one connection, so it's cheap), or
   keep every key pinned to its own player for v1?
4. **Playlist picker source.** Library playlists only (fast, what the user curated), or also
   albums and radios in v1 as separate keys?
5. **Default enqueue mode.** Replace (start fresh, like tapping a playlist in the MA app),
   or leave it to the server's default?
6. **Token onboarding.** Manual paste only, or also a "sign in" flow (`POST /auth/login`
   with username and password, then `auth/token/create`) so users never see a token? The
   sign-in flow means the panel handles a password once; the paste flow never does.
7. **GitHub.** Org or personal account, repo name, and whether to open it before v1 lands.

## Testing

- `npm test`: fake Music Assistant over `ws` (handshake, auth, partial results, errors,
  events, closes). The session tests will add reconnects, redirection of commands to synced
  leaders, and filtered player lists.
- `MA_URL=192.168.1.10 MA_TOKEN=… npm run probe`: read-only dump of the real server, then
  10 s of events. First thing to run once a token exists: confirms players, features,
  playlist URIs and artwork URLs are what the plan assumes.
- Manual: Stream Deck app 7.1+, `npx streamdeck link`, `npm run watch`; SD+ dials on
  Brennan's deck for the strip layouts.

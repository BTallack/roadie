# Music Assistant's API, as the plugin uses it

What the plugin can and can't do comes straight from the server. This is what the source
says as of 25 Sep 2026: `music-assistant/server` at API schema 77 (2.11 nightlies),
`music-assistant/client` and `music-assistant/models`, plus the docs at music-assistant.io.
Brennan's own server is 2.10.4, schema 65, running as the Home Assistant add-on at
`http://192.168.1.10:8095` (advertised on mDNS as `mass.local`).

## Where the server is

- Port 8095, HTTP. The server's URL is in the mDNS record `_mass._tcp.local.`, whose TXT
  fields carry `base_url`, `server_version` and `schema_version`. Node has no mDNS of its
  own, so discovery in the settings panel would need a dependency or shelling out to
  `dns-sd` (macOS) or a Bonjour install (Windows). Typing the address is the baseline.
- `GET /info` needs no token and returns the same `ServerInfoMessage` the socket sends first
  (`server_id`, `server_version`, `schema_version`, `min_supported_schema_version`, `name`,
  `internal_url`, `external_url`, `onboard_done`, `status`). CORS is open on it. Use it to
  check an address before asking for a token.
- Interactive docs live on every server at `/api-docs` (commands, args, models).
- Remote access (the `MA-XXXX-XXXX` id) is WebRTC through Music Assistant's signalling
  server, built for their web app and mobile apps. Not for us: the plugin works on the LAN,
  a VPN, or an `external_url` the user has exposed themselves.

## Talking to it

Two ways in, same commands:

- WebSocket `ws://host:8095/ws` (the plugin's way: it gets events).
- HTTP `POST /api` with header `Authorization: Bearer <token>` and the same JSON body
  (handy for `curl`, not used by the plugin).

Handshake on the socket, in order:

1. Server sends its info message first.
2. If the server has no users yet it sends `{ "message_id": "connection", "error_code": 503,
   "details": "Setup required" }` and closes.
3. Client sends `{ "message_id": "1", "command": "auth", "args": { "token": "…" } }`.
   Answer: `{ "message_id": "1", "result": { "authenticated": true, "user": {…} } }`, or an
   error with code 23 (invalid token). Nothing else works before this (code 20).
4. From then on the server also pushes events to this socket.

Commands: `{ message_id, command, args }`. Answers: `{ message_id, result }`, possibly
several with `"partial": true` before the last one (large lists), or
`{ message_id, error_code, details }`. Events: `{ event, object_id, data }`.

There's no application-level heartbeat. `time` (unauthenticated) returns the server's UTC
timestamp and doubles as a liveness check and clock-offset measurement for progress bars.

Error codes that matter to the keys: 9 unsupported feature, 10 player unavailable,
11 player command failed, 12 invalid command, 20 authentication required, 21 authentication
failed, 22 insufficient permissions, 23 invalid token.

## Tokens and permissions

Since API schema 28 every server has user accounts and every client needs a token. Two kinds:
session tokens (30-day sliding) and long-lived tokens (10 years, no renewal), created in the
Music Assistant UI under Settings, Profile, "Long-lived access tokens", or by an admin for
any user under User management. The token is a bearer string; the plugin stores it in Stream
Deck's global settings and sends it only to that server.

Roles are named sets of scopes. The built-in `guest` role holds exactly what the plugin
needs: `library.read`, `players.read`, `players.control`, `queues.read`, `queues.control`,
`providers.read`, `config.players.read`. `user` adds library writes (not needed). So the
recommended setup is a dedicated "Stream Deck" user with the guest role and a long-lived
token, optionally with a player filter so the deck only sees some players. An admin's token
works too.

A user's player filter and music-source filter shape everything the plugin sees: `players/all`
and playlist listings are already filtered server-side per user.

## Players

`players/all` (args `return_unavailable`, `return_disabled`, `return_protocol_players`, all
optional) returns `Player` records. Events `player_added`, `player_updated`, `player_removed`
carry the full record as `data` and the id as `object_id`. Fields the keys use:

- `player_id`, `name`, `available`, `enabled`, `hide_in_ui`, `private` (a browser or app's
  own player; don't offer it), `type` (`player`, `group`, `stereo_pair`, `protocol`), `icon`.
- `playback_state`: `idle`, `paused`, `playing`.
- `powered` (null when the player has no power), `volume_level` 0..100, `volume_muted`,
  `group_volume`.
- `supported_features`: `power`, `volume_set`, `volume_mute`, `pause`, `seek`,
  `next_previous`, `enqueue`, `play_media`, `set_members`. Keys grey out what's missing.
- `active_source`: a queue id when Music Assistant is playing, otherwise the player's own
  source (Spotify Connect, line-in, TV…). `current_media` has `title`, `artist`, `album`,
  `image_url`, `duration` even for external sources, when the player reports them.
- `synced_to`, `active_group`, `group_members` for sync groups. Commands to a synced child
  are redirected to the leader by the server.

Commands (scope `players.control`), all taking `player_id`:
`players/cmd/play`, `pause`, `play_pause`, `stop`, `next`, `previous`, `power {powered}`,
`volume_set {volume_level}`, `volume_up`, `volume_down` (the server's configured step,
default 5), `volume_mute {muted}`, `seek {position}`, `select_source {source}`,
`group {target_player}`, `ungroup`, `play_announcement {url|message, …}`.
Play/pause/next/previous go to the player's queue when Music Assistant is the source, and to
the native source when it can (`can_next_previous`, `can_play_pause` on the source).

## Queues

Every player has a queue with the same id as the player. `player_queues/all` lists them;
`player_queues/get_active_queue {player_id}` resolves the one a player is actually playing
(the leader's, for synced players). Events `queue_added`, `queue_updated` carry the full
`PlayerQueue`; `queue_time_updated` carries just the elapsed seconds as `data`.

`PlayerQueue` fields: `queue_id`, `active` (Music Assistant is this player's source),
`state`, `current_item` (`name`, `duration`, `media_item` with artists/album/images,
`image`), `next_item`, `elapsed_time`, `elapsed_time_last_updated` (server clock),
`shuffle_enabled`, `repeat_mode` (`off`, `one`, `all`), `items`, `sources` (what it was
loaded from: the playlist, album or radio playlist; `radio_source` on older servers),
`is_dynamic`, `ended`.

Commands (scope `queues.control`), all taking `queue_id`:
`player_queues/play_media {media, option, shuffle, start_item}`, `play_pause`, `play`,
`pause`, `stop`, `resume`, `next`, `previous`, `clear`, `seek {position}`, `skip {seconds}`,
`shuffle {shuffle_enabled}`, `repeat {repeat_mode}`, `transfer {source_queue_id,
target_queue_id, auto_play}`, `play_index {index}`.

`play_media` takes a URI or a list of them. `option` is one of `play` (insert at the current
position and start), `replace` (clear the queue, start from the top), `next`, `replace_next`,
`add` (append). Omitted, the server uses its default (`replace` for playlists and albums,
`play` for tracks, per its "default enqueue" settings). `shuffle: true|false` applies to
`play` and `replace`. `radio_mode` is deprecated: a "radio" of an item is the URI
`radio_playlist://playlist/<item uri>`.

## Library

Everything is a `MediaItem` with a `uri` such as `library://playlist/12` or
`spotify://playlist/37i9dQ…`. The plugin plays by URI, so it never needs provider ids.

- `music/playlists/library_items {favorite?, search?, limit?, offset?, order_by?,
  provider?}` returns `Playlist` records: `name`, `uri`, `owner`, `favorite`, `is_editable`,
  `is_dynamic`, `metadata.images`. `order_by` takes `sort_name`, `timestamp_added`,
  `last_played`, `play_count`… Big libraries stream back as partial results.
- The same shape exists for albums, artists, tracks, radios, audiobooks and podcasts
  (`music/albums/library_items` and so on), plus `music/search {search_query, media_types,
  limit}`, `music/recently_played_items`, `music/recommendations`, `music/item_by_uri {uri}`
  and `music/browse {path}`. So a "Play this album" or "Radio station" key is the same work
  as the playlist key, with a different picker.
- `media_item_added`, `media_item_updated`, `media_item_deleted` events (with the URI as
  `object_id`) say when a picked playlist changed or vanished.

## Artwork

Every image in an API response carries a `proxy_id` (schema 31 and up). Fetch it at
`GET {internal_url}/imageproxy/{proxy_id}?size=160` with size one of 0, 80, 160, 256, 512,
1024 (0 = original; other sizes are rejected with 400). No token is needed on that route in
the current source. Images with `remotely_accessible: true` can also be fetched from their
own `path`. `current_media.image_url` on a player is already a full URL. The key draws at
144 px, so 160 is the size to ask for, and the plugin caches by `proxy_id`.

## Versions

- Schema 28: user accounts and tokens (the plugin's floor). Servers below it are refused
  with a clear message rather than half-working.
- Schema 31: `proxy_id` on images. Below that, artwork keys fall back to no art.
- Schema 34: `radio_playlist://` URIs.
- Schema 65: Brennan's 2.10.4. Schema 77: current nightlies. Nothing the plan relies on
  changed between them; the nightlies add `output_protocols`, sleep timers, dashboards.

## What that means we can and can't do

Can, with the API as it is:
- Play, pause, stop, next, previous, volume up/down/set, mute, power, per player.
- Show what's playing on any player, with artwork and progress, including when the player is
  on Spotify Connect or another native source (title/artist/art come from the player).
- Load any library playlist (or album, radio, track, artist radio) on any player with a
  chosen enqueue mode and shuffle, and light the key while the queue is playing from it.
- Shuffle and repeat toggles, seek and skip-by-seconds (dials).
- Group and ungroup players, transfer a queue to another player, announcements/TTS.
- Live updates: every change arrives as an event, so nothing polls.
- Restrict what a deck sees by giving its user a player filter.

Can't, or not worth it:
- Connect through Music Assistant's remote access id: WebRTC-only, built for their apps.
- Browse the whole library from a key: pickers belong in the settings panel, keys are for
  chosen items.
- See a player that its user isn't allowed to see (by design).
- Ping at the WebSocket level from Node's built-in `WebSocket`; the `time` command stands in.
- Discover the server without an extra dependency (mDNS). Deferred; typing the address works.

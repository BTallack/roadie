# Roadie for Music Assistant

Your [Music Assistant](https://www.music-assistant.io) players on an Elgato Stream Deck:
now playing with artwork, play/pause, skip, stop, volume, and keys that load your playlists.
Roadie talks straight to your own Music Assistant server over its WebSocket API; nothing goes
through any other service. It isn't an official Music Assistant project.

## Keys

| Key | Shows | Press |
|---|---|---|
| Now playing | Artwork, title and artist (scrolling when too long to fit), a state dot, a progress bar that keeps moving | Play / pause. On a Stream Deck+ dial: turn for volume |
| Play / Pause | Play while paused or idle, pause while playing; grey when the player can't | Toggles |
| Next / Previous | Skip glyph, lit while something is playing or paused | Skips |
| Stop | Stop glyph, lit while something is playing or paused | Stops |
| Volume | One of five, chosen in settings: volume up, volume down, mute (yellow while muted), the current level on an arc, or the level with press-to-mute. Two icon styles: sound waves (one for down, three for up, none for mute, as on Apple keyboards) or plus and minus signs | Steps, mutes, or nothing for the display-only level. On a dial: turn for volume, press to mute |
| Playlist | The playlist's artwork and name; framed green while the player plays from it, yellow while paused on it | Loads it on the player: replace the queue, play now, play next, or add to the end; shuffle on, off or as the server is set |
| Radio station | The station's artwork and name, framed the same way. The picker groups stations by network (DI.FM, JazzRadio, RadioTunes…) or provider, favourites first | Loads it on the player, with the same enqueue choices |
| Album | Artwork and name; the picker lists albums with their artist | Loads it, with enqueue and shuffle choices |
| Artist radio | The artist's picture and name | Starts a never-ending mix seeded by that artist (Music Assistant 2.9 and later) |
| Shuffle | Crossed arrows, green while on; grey when Music Assistant isn't the source or the queue is a dynamic mix | Toggles shuffle on the player's queue |
| Repeat | A loop, green for all, with a 1 for one | Steps off, all, one |
| Favourite | A heart, filled while the current track is a favourite | Adds what's playing to your favourites (on a radio stream, the track playing); for a library track already favourited, takes it out. Needs a user with library access, so the `user` role rather than `guest` |
| Group | Two speakers, linked and green while the player is grouped under the chosen target | Joins the player to the target, or leaves it. Only players the server says can group together are offered |
| Move queue | An arrow to the chosen player | Moves the player's queue to that player and carries on there |
| Select player | A room button: the player's name and what's playing (track then artist, artist then track, station or playlist then track, or nothing), framed while it's the deck's selection. Or, in cycle mode, the current selection with its place in your list (2 / 5, hideable). The player's state shows as a dot above the name or, for more room, as a border around the key | Selects that player for every key set to "Selected on this deck"; in cycle mode, each press moves the selection to the next ticked player. On a dial: turn to step through players, the strip shows the selected one's now playing, press to play or pause |

Every key names its player, or follows the deck's selection ("Selected on this deck", the
first entry in every player picker) so one row of keys can serve whichever room was last
chosen with a Select player key or dial. The name shows as a small line at the top unless
"Hide player name" is ticked; glyph keys can also drop their caption word, and the now-playing key its title and
artist. A new key starts with the settings the last key was given (player, hide switches,
volume mode, enqueue mode), so a row of keys for one room takes one pick.
Group players (Sonos sync groups, Music Assistant groups) work like any other, with the
group's volume. Players on another source (Spotify Connect, line-in) show what the player
reports and take the commands it supports.

The plan and what's next are in [docs/PLAN.md](docs/PLAN.md); what the API allows is in
[docs/music-assistant-api.md](docs/music-assistant-api.md).

## Install

Download the latest `.streamDeckPlugin` from the [releases page](https://github.com/BTallack/roadie/releases)
and double-click it; the Stream Deck app installs it. Then drag any Roadie key onto a page
and enter your server's address and a token in the key's settings (once, shared by every key).

## Requirements

- Stream Deck app 7.1 or later, macOS 12+ or Windows 10+.
- Music Assistant with user accounts (API schema 28 or later; 2.10 and up is what's tested),
  reachable from this computer (same network or VPN).
- A long-lived token: in Music Assistant, Settings, Profile, "Long-lived access tokens".
  A dedicated user with the guest role is enough to control players and load playlists;
  the Favourite key needs the user role. A player filter on that user limits what the deck
  can reach.

## Privacy and security

- Roadie talks to one host: the Music Assistant server you enter. Nothing goes to any
  other service. Artwork comes through the server's own image proxy; the one exception is
  a player that reports a direct image URL for an external source, which is fetched as
  given.
- The token is kept in Stream Deck's global settings, on disk with the rest of your
  Stream Deck configuration, and sent only to that server. Use a dedicated Music Assistant
  user for the deck, so the token can be revoked on its own and, with a player filter,
  reaches only the players you choose.
- Logging stays at "info": the plugin never logs the token or settings messages.
- Everything the server sends is treated as data: names go through an escape before they
  reach a key image, and artwork is embedded only when the server answers with a plain
  image type.

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

# Elgato Marketplace listing

Everything the Maker Console asks for, checked against Elgato's
[plugin guidelines](https://docs.elgato.com/guidelines/stream-deck/plugins/) and
[product guidelines](https://docs.elgato.com/guidelines/products/) on 30 September 2026.
Rebuild the images with `scripts/marketplace.sh` after any change to how keys look.

## Product

- **Name:** Roadie for Music Assistant (26 characters; the limit is 30)
- **Category (manifest):** Roadie for Music Assistant, matching the name as the guidelines ask
- **Author:** Tallack Media
- **Price:** Free
- **Support:** https://github.com/BTallack/roadie/issues
- **Source:** https://github.com/BTallack/roadie (MIT)

## Description

1,070 characters; the limit is 250 to 1,500, plain text first.

> Roadie puts your Music Assistant players on your Stream Deck. Every key shows live state from your own server: what's playing with its artwork, the volume, and which playlist or station is on.
>
> Keys: Now playing, Play/Pause, Next, Previous, Stop, Volume (up, down, mute or the level, in two icon styles), Playlist, Radio station, Album, Artist radio, Shuffle, Repeat, Favourite, Group, Move queue and Select player. Set a row of keys to "Selected on this deck" and one Select player key switches the whole row between rooms. On Stream Deck+, dials turn for volume and step through players.
>
> Roadie talks straight to the Music Assistant server on your network. Nothing goes through the cloud, and no data is collected.
>
> Requirements: Music Assistant 2.7 or later, reachable from this computer, and a long-lived token from Music Assistant's Settings, Profile page (a user with the guest role is enough, except for the Favourite key). Stream Deck 7.1 or later on macOS 12 or Windows 10 and later.
>
> Roadie is an independent project and isn't affiliated with Music Assistant.

## Images

| File | Size | Use |
|---|---|---|
| `app-icon.png` | 288 × 288 | Marketplace app icon |
| `thumbnail.png` | 1920 × 960 | Listing thumbnail |
| `gallery-1.png` | 1920 × 960 | A full deck |
| `gallery-2.png` | 1920 × 960 | Playlist, radio, album and now-playing keys |
| `gallery-3.png` | 1920 × 960 | Select player and keys that follow it |
| `gallery-4.png` | 1920 × 960 | Volume styles, grouping, favourites, offline state |

Every image is drawn by the plugin's own renderer. Artwork is generated and every title is
invented, so nothing in the listing belongs to anyone else.

## Guidelines check

- Plugin icon: PNG at 256 and 512 px, square (the app rounds the corners).
- Category and action list icons: white (#FFFFFF) on transparent SVG, no colour, no backgrounds.
- Key images: SVG at 144 px, live state on every key; no more than ten updates a second per
  key or dial (enforced in `src/actions/base.ts`).
- Action names under 30 characters, each with a tooltip; 16 actions (2 to 30 allowed).
- UUIDs: `media.tallack.roadie`, actions prefixed with it. Never change these after publishing.
- Settings panels: checkboxes for booleans, selects for choices, saved on change, setup help in
  the server section, no copyright lines, no donation links.
- Feedback: `showAlert` when a command fails; a small corner tick for success, only on keys whose
  state change isn't otherwise visible.
- Privacy: no analytics, no personal data, one network destination (the user's server).

## Release notes for 0.3.0

See `CHANGELOG.md`.

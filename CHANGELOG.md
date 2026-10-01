# Changelog

## 0.3.0 (30 September 2026)

Audit before submitting to the Elgato Marketplace.

- Large libraries no longer knock every key offline. Node's WebSocket drops the connection
  on any message over about 4 MB, which a few thousand albums or artists reach; library lists
  now load 500 at a time.
- Keys show when Music Assistant is out of reach: dimmed, with a small orange badge, instead of
  frozen on the last state. A refused token clears the keys to "Token refused".
- Roadie keys work inside Stream Deck multi-actions.
- The success tick no longer sticks on a key whose state didn't visibly change.
- Updates to keys and dials are held to Elgato's limit of ten a second, and repeats aren't sent.
- Turning a volume dial quickly sends one command, not dozens.
- "Selected on this deck" is now really per deck: each Stream Deck keeps its own selection.
- New keys start from the last settings of their own kind (a Volume key from the last Volume
  key), with the player and name settings shared across kinds.
- Favourite on a radio stream adds the song playing and never removes the station.
- Group: only real players are offered as targets, and a group player's saved members no
  longer read as "grouped".
- Muting a group player mutes the whole group.
- The Select player key's own player list no longer offers "Selected on this deck".
- Playlist, station and album keys no longer read "gone" while the server is unreachable.
- A Favourite key is greyed out for guest tokens, which can't change favourites.
- Artist radio works on servers older than API schema 34.
- An address that answers but isn't Music Assistant (Home Assistant's port 8123, say) says so
  and suggests port 8095. Tokens pasted with "Bearer " in front work.
- Action list and category icons are white on transparent, as Elgato's guidelines require.
- Marketplace listing: app icon, thumbnail, four gallery images and description in
  `docs/marketplace/`, rebuilt by `scripts/marketplace.sh`.

## 0.2.0 (26 September 2026)

- Select player key: cycle mode steps through a ticked list; the position ("3 / 4") can be
  hidden; the state can be a border around the key instead of a dot; "What's playing"
  chooses track then artist, artist then track, station or playlist then track, or nothing.
- Radio streams show the track and artist the player reports (or the stream title split on
  the dash) instead of the station name, on the now-playing and Select player keys.
- Long titles scroll on the now-playing and Select player keys (can be turned off per key).
- Long player names wrap onto two lines on the Select player key and shrink before they
  trim elsewhere.
- Volume key: a display-only level, a level with press-to-mute, and two icon styles.
- New keys: Album, Artist radio, Shuffle, Repeat, Favourite, Group, Move queue.
- Stability: one coalesced redraw per burst of server events; unchanged images aren't
  resent; a connection whose first load fails is closed rather than left to reconnect
  twice; settings writes and image sends can't raise unhandled rejections.
- Security: artwork is only embedded when the server answers with a plain image type and
  a sane size; image proxy ids are URL-encoded.

## 0.1.0 (25 September 2026)

First release: Now playing (key and dial), Play/Pause, Next, Previous, Stop, Volume (key
and dial), Playlist, Radio station.

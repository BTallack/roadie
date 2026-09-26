# Changelog

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

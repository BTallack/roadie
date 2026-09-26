// The pure reads of player and queue state: what a key shows and what it may send.
import assert from "node:assert/strict";
import test from "node:test";

import { canTransport, nowPlayingOf, playbackState, volumeOf } from "../src/ma/playing";
import type { Player, PlayerQueue } from "../src/ma/types";

const player = (extra: Partial<Player> = {}): Player => ({ player_id: "p", provider: "sonos", type: "player", name: "Office", available: true, supported_features: ["pause", "next_previous", "volume_set"], playback_state: "idle", volume_level: 20, ...extra });
const queue = (extra: Partial<PlayerQueue> = {}): PlayerQueue => ({ queue_id: "p", active: true, display_name: "Office", available: true, items: 1, shuffle_enabled: false, repeat_mode: "off", state: "playing", elapsed_time: 0, elapsed_time_last_updated: 0, ...extra });

test("a radio stream reads the track and artist from the player's report, station as the source", () => {
	const p = player({ current_media: { uri: "x", title: "Dig It", artist: "STRNGE, Erwin Do, Erwo", album: "Jazz House" } });
	const q = queue({ current_item: { queue_id: "p", queue_item_id: "i", name: "Jazz House", duration: null, media_item: { item_id: "1", provider: "library", name: "Jazz House", media_type: "radio" }, streamdetails: { stream_title: "STRNGE, Erwin Do, Erwo - Dig It" } } });
	assert.deepEqual(nowPlayingOf(p, q), { track: "Dig It", artist: "STRNGE, Erwin Do, Erwo", source: "Jazz House", radio: true });
});

test("a radio stream without a player report splits the stream title on the dash", () => {
	const q = queue({ current_item: { queue_id: "p", queue_item_id: "i", name: "Jazz House", duration: null, media_item: { item_id: "1", provider: "library", name: "Jazz House", media_type: "radio" }, streamdetails: { stream_title: "Portishead - Glory Box" } } });
	assert.deepEqual(nowPlayingOf(player(), q), { track: "Glory Box", artist: "Portishead", source: "Jazz House", radio: true });
	const bare = queue({ current_item: { ...q.current_item!, streamdetails: { stream_title: "News at six" } } });
	assert.deepEqual(nowPlayingOf(player(), bare), { track: "News at six", artist: null, source: "Jazz House", radio: true });
});

test("a track reads its artists and what the queue was loaded from", () => {
	const q = queue({ sources: [{ item_id: "17", provider: "library", name: "Brennan's 33rd", media_type: "playlist", uri: "library://playlist/17" }], current_item: { queue_id: "p", queue_item_id: "i", name: "Eagle-Eye Cherry - Save Tonight", duration: 239, media_item: { item_id: "2", provider: "library", name: "Save Tonight", media_type: "track", artists: [{ item_id: "a", provider: "library", name: "Eagle-Eye Cherry", media_type: "artist" }], album: { item_id: "b", provider: "library", name: "Desireless", media_type: "album" } } } });
	assert.deepEqual(nowPlayingOf(player(), q), { track: "Save Tonight", artist: "Eagle-Eye Cherry", source: "Brennan's 33rd", radio: false });
	assert.equal(nowPlayingOf(player(), queue({ ...q, sources: [] })).source, "Desireless");
});

test("an external source uses what the player reports; nothing playing is empty", () => {
	assert.deepEqual(nowPlayingOf(player({ current_media: { uri: "spotify:x", title: "Song", artist: "Band", album: "LP" } }), undefined), { track: "Song", artist: "Band", source: "LP", radio: false });
	assert.deepEqual(nowPlayingOf(player(), undefined), { track: null, artist: null, source: null, radio: false });
});

test("state comes from the queue when Music Assistant is the source", () => {
	assert.equal(playbackState(player({ playback_state: "paused" }), queue({ state: "playing" })), "playing");
	assert.equal(playbackState(player({ playback_state: "paused" }), undefined), "paused");
});

test("transport is allowed through a queue whatever the features say, else by feature", () => {
	const group = player({ type: "group", supported_features: [] });
	assert.ok(canTransport(group, queue(), "pause"));
	assert.ok(!canTransport(group, undefined, "pause"));
	assert.ok(canTransport(player(), undefined, "next_previous"));
	assert.ok(!canTransport(player({ available: false }), queue(), "pause"));
});

test("group players carry the group volume", () => {
	assert.deepEqual(volumeOf(player({ type: "group", volume_level: null, group_volume: 40, group_volume_muted: true })), { level: 40, muted: true, group: true });
	assert.deepEqual(volumeOf(player({ volume_muted: false })), { level: 20, muted: false, group: false });
});

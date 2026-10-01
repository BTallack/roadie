// Builds the Marketplace scenes from the plugin's own renderer, with generated artwork and
// invented titles, so nothing in the listing belongs to anyone else.
import { mkdirSync, writeFileSync } from "node:fs";
import { groupKey, heartKey, mediaKey, nowPlayingKey, playPauseKey, powerKey, repeatKey, selectKey, shuffleKey, skipKey, transferKey, transportKey, volumeKey, withOffline } from "../src/render";

const out = "docs/marketplace/src";
mkdirSync(out, { recursive: true });
/** Abstract cover art: a two-colour gradient with soft shapes. */
const art = (a: string, b: string, shape: number) => {
  const shapes = [
    `<circle cx="100" cy="190" r="95" fill="#FFFFFF" opacity="0.18"/><circle cx="215" cy="70" r="55" fill="#FFFFFF" opacity="0.25"/>`,
    `<path d="M0 220 Q80 140 160 200 T300 170 V300 H0Z" fill="#000000" opacity="0.22"/><circle cx="210" cy="80" r="40" fill="#FFFFFF" opacity="0.5"/>`,
    `<rect x="40" y="40" width="120" height="120" rx="16" fill="#FFFFFF" opacity="0.2" transform="rotate(12 100 100)"/><rect x="130" y="130" width="120" height="120" rx="60" fill="#000000" opacity="0.18"/>`,
    `<g fill="none" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="10"><circle cx="150" cy="150" r="40"/><circle cx="150" cy="150" r="80"/><circle cx="150" cy="150" r="120"/></g>`,
    `<path d="M0 0 L300 300 M60 0 L300 240 M0 60 L240 300" stroke="#FFFFFF" stroke-opacity="0.22" stroke-width="22"/>`,
  ][shape % 5];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/>${shapes}</svg>`;
  return { data: Buffer.from(svg), type: "image/svg+xml" };
};
const covers = [art("#F7971E", "#C2185B", 0), art("#43CEA2", "#185A9D", 1), art("#8E2DE2", "#4A00E0", 2), art("#F953C6", "#B91D73", 3), art("#11998E", "#38EF7D", 4), art("#FC5C7D", "#6A82FB", 1), art("#2C3E50", "#4CA1AF", 0), art("#E96443", "#904E95", 3), art("#0F2027", "#2C5364", 2), art("#F2994A", "#F2C94C", 4)];

const decode = (u: string) => decodeURIComponent(u.replace(/^data:image\/svg\+xml;charset=utf8,/, ""));
const keys: Record<string, string> = {};
const k = (name: string, url: string) => (keys[name] = decode(url));

k("now", nowPlayingKey("Office", covers[0], { title: "Golden Hour", artist: "The Lanterns", state: "playing", available: true, progress: 0.42 }));
k("now2", nowPlayingKey("Kitchen", covers[1], { title: "Night Drive", artist: "Coastal", state: "playing", available: true, progress: 0.7 }));
k("now3", nowPlayingKey("Patio", covers[2], { title: "Slow Morning", artist: "Juniper", state: "paused", available: true, progress: 0.25 }));
k("prev", transportKey("previous", "Office", true));
k("play", playPauseKey("Office", "playing", true));
k("next", transportKey("next", "Office", true));
k("stop", transportKey("stop", "Office", true));
k("vdown", volumeKey("Office", 24, false, "down"));
k("vlevel", volumeKey("Office", 24, false, "level_mute"));
k("vup", volumeKey("Office", 24, false, "up"));
k("vmute", volumeKey("Office", 24, true, "mute"));
k("vdownS", volumeKey("Office", 24, false, "down", true, "signs"));
k("vupS", volumeKey("Office", 24, false, "up", true, "signs"));
k("vlevelOnly", volumeKey("Office", 24, false, "level"));
k("vset", volumeKey("Office", 30, false, "set", true, "waves", 30));
k("skip", skipKey("Office", -15, true));
k("power", powerKey("Living Room", true, "toggle"));
k("shuffle", shuffleKey("Office", true, true));
k("repeat", repeatKey("Office", "all", true));
k("heart", heartKey("Office", true));
k("group", groupKey("Kitchen", "Office", true, true));
k("transfer", transferKey("Office", "Kitchen", true));
k("sel", selectKey("Office", "playing", true, ["The Lanterns", "Golden Hour"], { selected: false, border: true, position: "1 / 4", scroll: false }));
k("roomOffice", selectKey("Office", "playing", true, ["Golden Hour", "The Lanterns"], { selected: true, border: true, scroll: false }));
k("roomKitchen", selectKey("Kitchen", "playing", true, ["Night Drive", "Coastal"], { selected: false, border: true, scroll: false }));
k("roomBath", selectKey("Downstairs Bathroom", "paused", true, ["Slow Morning"], { selected: false, border: true, scroll: false }));
k("roomBed", selectKey("Bedroom", "idle", true, [], { selected: false, border: true, scroll: false }));
["Backyard BBQ", "Afternoon Acoustic", "Coding Mode", "Dance Party", "Road Trip"].forEach((n, i) => k(`pl${i}`, mediaKey("playlist", null, covers[i + 3], n, i === 0 ? "playing" : false, true)));
["Jazz Lounge", "Coffee House", "Classic Rock", "Chillhop", "Morning News"].forEach((n, i) => k(`rd${i}`, mediaKey("radio", null, covers[(i + 6) % 10], n, i === 0 ? "playing" : false, true)));
["Summer Static", "Paper Moons"].forEach((n, i) => k(`al${i}`, mediaKey("album", null, covers[(i + 1) % 10], n, false, true)));
k("offline", withOffline(playPauseKey("Office", "playing", true)));
writeFileSync(`${out}/keys.json`, JSON.stringify(keys));
console.log(Object.keys(keys).length, "keys");

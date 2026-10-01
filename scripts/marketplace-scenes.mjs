// Composes the Marketplace thumbnail, gallery scenes and app icon as pages; scripts/marketplace.sh
// screenshots them at exact sizes. Run from the repo root after scripts/marketplace-keys.ts.

import { readFileSync, writeFileSync } from "node:fs";
const dir = "docs/marketplace";
const keys = JSON.parse(readFileSync(`${dir}/src/keys.json`, "utf8"));
const icon = readFileSync("docs/icons/key-grid-square.svg", "utf8");
const key = (name, size = 144) => `<div class="key" style="width:${size}px;height:${size}px">${keys[name].replace("<svg ", `<svg width="${size}" height="${size}" `).replace(/width="144" height="144" viewBox/, "viewBox")}</div>`;
const deck = (rows, size = 132, gap = 22) => `<div class="deck" style="padding:${gap * 1.6}px"><div class="grid" style="grid-template-columns:repeat(${rows[0].length},${size}px);gap:${gap}px">${rows.flat().map((n) => (n ? key(n, size) : `<div class="key blank" style="width:${size}px;height:${size}px"></div>`)).join("")}</div></div>`;
const page = (body, extra = "") => `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1920px;height:960px;overflow:hidden;font-family:-apple-system,"SF Pro Display","Segoe UI",Helvetica,Arial,sans-serif;color:#fff;background:radial-gradient(1200px 700px at 75% 40%,#1d3b2c 0%,#0e1110 55%,#0a0c0b 100%)}
.key{border-radius:18px;overflow:hidden;box-shadow:0 2px 0 rgba(255,255,255,.06) inset,0 6px 14px rgba(0,0,0,.45)}
.key svg{display:block}
.key.blank{background:#141716}
.deck{display:inline-block;background:linear-gradient(#202423,#151817);border-radius:44px;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 2px #2b302e inset}
.grid{display:grid}
h1{font-size:76px;font-weight:800;letter-spacing:-1.5px;line-height:1.02}
h2{font-size:30px;font-weight:500;color:#b9c2be;line-height:1.35;margin-top:22px}
.row{display:flex;align-items:center}
.label{font-size:22px;color:#9aa39f;margin-top:14px;text-align:center}
.accent{color:#30d158}
${extra}</style></head><body>${body}</body></html>`;

// Thumbnail: name and mark on the left, a deck on the right.
writeFileSync(`${dir}/src/thumbnail.html`, page(`
<div class="row" style="height:960px;padding:0 110px;justify-content:space-between">
  <div style="width:720px">
    <div style="width:150px;height:150px;border-radius:34px;overflow:hidden;box-shadow:0 18px 40px rgba(0,0,0,.5)">${icon.replace("<svg ", '<svg width="150" height="150" ')}</div>
    <h1 style="margin-top:44px;font-size:104px">Roadie</h1>
    <h2 style="font-size:40px;margin-top:10px">for <span class="accent" style="font-weight:700">Music Assistant</span></h2>
    <h2 style="margin-top:36px">Now playing, transport, volume, playlists and radio for every room, on your Stream Deck.</h2>
  </div>
  ${deck([["sel", "now", "prev", "play", "next"], ["vdown", "vlevel", "vup", "shuffle", "repeat"], ["pl0", "pl1", "rd0", "rd1", "heart"]], 128, 20)}
</div>`));

// 1: the whole deck.
writeFileSync(`${dir}/src/gallery-1.html`, page(`
<div class="row" style="height:960px;padding:0 110px;justify-content:space-between">
  <div style="width:640px"><h1>Your house,<br>on one deck</h1><h2>Every key shows live state from your own Music Assistant server: what's playing, the volume, which playlist is on. Nothing goes through the cloud.</h2></div>
  ${deck([["sel", "now", "prev", "play", "next"], ["vdown", "vlevel", "vup", "shuffle", "repeat"], ["pl0", "pl1", "rd0", "rd1", "heart"]], 140, 22)}
</div>`));

// 2: media keys.
const scene = (title, text, rows) => page(`<div style="height:960px;display:flex;flex-direction:column;justify-content:center;padding:0 110px">
  <h1>${title}</h1><h2 style="max-width:1500px">${text}</h2>
  ${rows.map((r) => `<div class="row" style="gap:${r.gap ?? 40}px;margin-top:${r.top ?? 70}px">${r.html}</div>`).join("")}</div>`);
const tile = (name, text, size = 206) => `<div style="display:flex;flex-direction:column;align-items:center">${key(name, size)}<div class="label" style="font-size:24px">${text}</div></div>`;
writeFileSync(`${dir}/src/gallery-2.html`, scene("One press to play", "Playlists, radio stations, albums and artist radio, with their artwork. A key lights up while its room is playing it.", [
  { html: tile("pl0", "Playlist, playing") + tile("pl2", "Playlist") + tile("rd0", "Radio, playing") + tile("rd1", "Radio station") + tile("al0", "Album") + tile("now2", "Now playing") },
]));

// 3: selected player.
writeFileSync(`${dir}/src/gallery-3.html`, scene("One row of keys, any room", 'Pick a room with a Select player key, or step through a list with one key. Every key set to "Selected on this deck" follows along.', [
  { gap: 30, html: `${key("roomOffice", 196)}${key("roomKitchen", 196)}${key("roomBath", 196)}${key("roomBed", 196)}` },
  { gap: 30, top: 40, html: `<div style="width:${196 * 4 + 30 * 3}px;display:flex;align-items:center;justify-content:center;color:#7d8782;font-size:26px">▼&nbsp;&nbsp;Office is selected, so these keys control the Office&nbsp;&nbsp;▼</div>` },
  { gap: 30, top: 40, html: `${key("now", 196)}${key("prev", 196)}${key("play", 196)}${key("next", 196)}` },
]));

// 4: volume and rooms.
writeFileSync(`${dir}/src/gallery-4.html`, scene("Volume, rooms and more", "Louder, quieter, mute, a set level or the level itself, in two icon styles. Join rooms, move a queue, favourite what's playing, skip through podcasts, switch players on and off.", [
  { gap: 32, html: `${tile("vdown", "Quieter", 190)}${tile("vup", "Louder", 190)}${tile("vmute", "Muted", 190)}${tile("vlevel", "Level, press to mute", 190)}${tile("vset", "Set to a level", 190)}${tile("vupS", "Signs style", 190)}` },
  { gap: 32, top: 50, html: `${tile("group", "Join a room", 190)}${tile("transfer", "Move the queue", 190)}${tile("heart", "Favourite", 190)}${tile("skip", "Skip back", 190)}${tile("power", "Power", 190)}${tile("offline", "Shows when offline", 190)}` },
]));

// App icon, 288 px.
writeFileSync(`${dir}/src/app-icon.html`, `<!doctype html><html><body style="margin:0;width:288px;height:288px;overflow:hidden">${icon.replace("<svg ", '<svg width="288" height="288" style="display:block" ')}</body></html>`);
console.log("pages written");

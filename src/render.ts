import type { Artwork } from "./ma/session";
import type { PlaybackState } from "./ma/types";

/**
 * Key images, drawn as SVG at 144 px (the @2x key size) and handed to Stream Deck as data
 * URLs, so every key shows live state rather than a fixed icon. Artwork goes in as base64.
 */
const SIZE = 144;
const FONT = "-apple-system, 'SF Pro Text', 'Segoe UI', Helvetica, Arial, sans-serif";
const BG = "#101312";

export const COLORS = {
	playing: "#30D158",
	paused: "#FFD60A",
	idle: "#8E8E93",
	accent: "#5AC8FA",
	failed: "#FF453A",
	track: "#2C2C2E",
	text: "#FFFFFF",
	secondary: "#AEAEB2",
	disabled: "#48484A",
};

function svg(body: string, background = BG): string {
	const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="${background}"/>${body}</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(markup)}`;
}

function escape(text: string): string {
	return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** Trims to fit a key at the given size; SVG text doesn't truncate on its own. */
function fit(text: string, fontSize: number, width = SIZE - 16): string {
	const max = Math.floor(width / (fontSize * 0.56));
	return text.length > max ? `${text.slice(0, Math.max(max - 1, 1))}…` : text;
}

function label(text: string, y: number, size: number, color = COLORS.text, weight = 600, x = 72, anchor = "middle", width?: number): string {
	return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${color}">${escape(fit(text, size, width))}</text>`;
}

export function stateColor(state: PlaybackState | undefined, available = true): string {
	if (!available) return COLORS.disabled;
	switch (state) {
		case "playing":
			return COLORS.playing;
		case "paused":
			return COLORS.paused;
		default:
			return COLORS.idle;
	}
}

export function stateLabel(state: PlaybackState | undefined, available = true): string {
	if (!available) return "Unavailable";
	switch (state) {
		case "playing":
			return "Playing";
		case "paused":
			return "Paused";
		case "idle":
			return "Idle";
		default:
			return state ? state.charAt(0).toUpperCase() + state.slice(1) : "No status";
	}
}

/** Shown before the server is set up, when the player is missing, and while loading. */
export function messageKey(title: string, detail: string, color = COLORS.secondary): string {
	return svg(label(title, 66, 20, COLORS.text, 700) + label(detail, 94, 15, color, 500));
}

/** Artwork as an <image> filling the key, or nothing. */
function picture(art: Artwork | undefined): string {
	return art ? `<image href="data:${art.type};base64,${art.data.toString("base64")}" x="0" y="0" width="144" height="144" preserveAspectRatio="xMidYMid slice"/>` : "";
}

/**
 * Glyph keys: the player's name as a small line at the top (or nothing, when hidden), the
 * glyph in the middle, and a caption word at the bottom (or nothing). With both off the
 * glyph alone sits at the key's centre, a little larger.
 */
function glyphKey(glyph: string, name: string | null, caption: string | null, color: string): string {
	const top = name !== null ? label(name, 22, 14, COLORS.secondary, 600) : "";
	const bottom = caption !== null ? label(caption, 132, 17, color) : "";
	const centerY = caption !== null ? (name !== null ? 76 : 70) : name !== null ? 84 : 72;
	const scale = caption !== null || name !== null ? 1 : 1.2;
	return svg(top + `<g transform="translate(72 ${centerY}) scale(${scale}) translate(-72 -66)">${glyph}</g>` + bottom);
}

export type Transport = "play" | "pause" | "next" | "previous" | "stop";

const GLYPHS: Record<Transport, (color: string) => string> = {
	play: (c) => `<path d="M54 36 L104 66 L54 96 Z" fill="${c}" stroke="${c}" stroke-width="6" stroke-linejoin="round"/>`,
	pause: (c) => `<rect x="48" y="38" width="16" height="56" rx="4" fill="${c}"/><rect x="80" y="38" width="16" height="56" rx="4" fill="${c}"/>`,
	next: (c) => `<path d="M40 40 L82 66 L40 92 Z" fill="${c}"/><rect x="90" y="40" width="12" height="52" rx="3" fill="${c}"/>`,
	previous: (c) => `<path d="M104 40 L62 66 L104 92 Z" fill="${c}"/><rect x="42" y="40" width="12" height="52" rx="3" fill="${c}"/>`,
	stop: (c) => `<rect x="44" y="38" width="56" height="56" rx="12" fill="${c}"/>`,
};

const CAPTIONS: Record<Transport, string> = { play: "Play", pause: "Pause", next: "Next", previous: "Previous", stop: "Stop" };

/** A transport key: the glyph in the state's colour, grey when the player can't do it. */
export function transportKey(kind: Transport, name: string | null, enabled: boolean, showCaption = true, color?: string): string {
	const tint = !enabled ? COLORS.disabled : (color ?? COLORS.text);
	return glyphKey(GLYPHS[kind](tint), name, showCaption ? CAPTIONS[kind] : null, enabled ? COLORS.text : COLORS.secondary);
}

/** Play while paused or idle, pause while playing. */
export function playPauseKey(name: string | null, state: PlaybackState | undefined, enabled: boolean, showCaption = true): string {
	const playing = state === "playing";
	return transportKey(playing ? "pause" : "play", name, enabled, showCaption, playing ? COLORS.paused : COLORS.playing);
}

export type VolumeMode = "up" | "down" | "mute" | "level" | "level_mute";

/** A speaker glyph centred on (72, 66): waves, or a cross when muted. */
function speakerGlyph(color: string, muted: boolean): string {
	const body = `<path d="M34 52 h16 l20 -18 v64 l-20 -18 h-16 z" fill="${color}"/>`;
	if (muted) return body + `<path d="M84 54 l22 24 M106 54 l-22 24" stroke="${color}" stroke-width="7" stroke-linecap="round"/>`;
	return body + `<path d="M82 54 q12 12 0 24 M94 44 q22 22 0 44" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"/>`;
}

/**
 * Volume keys. `up` and `down` show a speaker with a plus or minus; `mute` a speaker,
 * crossed and yellow while muted; `level` and `level_mute` the number on an arc (the
 * latter's caption says a press mutes). All grey out when the player has no volume.
 */
export function volumeKey(name: string | null, level: number | null, muted: boolean, mode: VolumeMode, showCaption = true): string {
	const color = level === null ? COLORS.disabled : muted ? COLORS.paused : COLORS.accent;
	const captionColor = level === null ? COLORS.secondary : COLORS.text;
	if (mode === "level" || mode === "level_mute") {
		const fraction = level === null ? 0 : Math.max(0, Math.min(1, level / 100));
		const cy = showCaption ? (name !== null ? 76 : 70) : name !== null ? 84 : 72;
		const arc = 2 * Math.PI * 38 * 0.75;
		const gauge =
			`<circle cx="72" cy="${cy}" r="38" fill="none" stroke="${COLORS.track}" stroke-width="9" stroke-dasharray="${arc} 999" transform="rotate(135 72 ${cy})" stroke-linecap="round"/>` +
			`<circle cx="72" cy="${cy}" r="38" fill="none" stroke="${color}" stroke-width="9" stroke-dasharray="${arc * fraction} 999" transform="rotate(135 72 ${cy})" stroke-linecap="round"/>`;
		const centre = muted
			? `<g transform="translate(72 ${cy}) scale(0.55) translate(-72 -66)">${speakerGlyph(COLORS.paused, true)}</g>`
			: label(level === null ? "–" : String(Math.round(level)), cy + 9, 26, level === null ? COLORS.secondary : COLORS.text, 700);
		const top = name !== null ? label(name, 22, 14, COLORS.secondary, 600) : "";
		const bottom = showCaption ? label(mode === "level_mute" ? (muted ? "Unmute" : "Mute") : muted ? "Muted" : "Volume", 132, 17, captionColor) : "";
		return svg(top + gauge + centre + bottom);
	}
	const badge =
		mode === "up"
			? `<path d="M108 100 h20 M118 90 v20" stroke="${color}" stroke-width="7" stroke-linecap="round"/>`
			: mode === "down"
				? `<path d="M108 100 h20" stroke="${color}" stroke-width="7" stroke-linecap="round"/>`
				: "";
	const glyph = speakerGlyph(color, mode === "mute" ? muted : false) + badge;
	const caption = mode === "mute" ? (muted ? "Unmute" : "Mute") : mode === "up" ? "Louder" : "Quieter";
	return glyphKey(glyph, name, showCaption ? caption : null, captionColor);
}

export type NowPlaying = { title: string | null; artist: string | null; state: PlaybackState | undefined; available: boolean; progress: number | null; /** Draw the title and artist band (off: artwork alone). */ caption?: boolean };

/** Artwork with the title and artist over a dark band; a state dot and a thin progress bar. */
export function nowPlayingKey(name: string | null, art: Artwork | undefined, now: NowPlaying): string {
	const color = stateColor(now.state, now.available);
	let body = picture(art);
	if (!art) body += `<path d="M62 100 V44 l40 -10 v50" fill="none" stroke="${COLORS.idle}" stroke-width="6" stroke-linejoin="round"/><circle cx="52" cy="100" r="11" fill="${COLORS.idle}"/><circle cx="92" cy="84" r="11" fill="${COLORS.idle}"/>`;
	if (name !== null) body += `<rect width="144" height="30" fill="#000000" opacity="0.55"/>` + label(name, 21, 15, COLORS.text, 600, 12, "start", 112) + `<circle cx="128" cy="15" r="6" fill="${color}"/>`;
	else body += `<circle cx="128" cy="16" r="7" fill="${color}" stroke="#000000" stroke-opacity="0.5" stroke-width="2"/>`;
	if ((now.title && now.caption !== false) || !now.available) {
		const title = now.available ? now.title! : "Unavailable";
		const twoLines = now.available && !!now.artist;
		body += `<rect y="${twoLines ? 92 : 108}" width="144" height="${twoLines ? 52 : 36}" fill="#000000" opacity="0.6"/>`;
		body += label(title, twoLines ? 113 : 131, 15, COLORS.text, 700);
		if (twoLines) body += label(now.artist!, 133, 13, COLORS.secondary, 500);
	} else if (!art) {
		body += label(stateLabel(now.state), 131, 15, color, 700);
	}
	if (now.progress !== null) body += `<rect x="0" y="140" width="144" height="4" fill="#000000" opacity="0.5"/><rect x="0" y="140" width="${Math.round(144 * now.progress)}" height="4" fill="${color}"/>`;
	return svg(body);
}

export type MediaKind = "playlist" | "radio";

const MEDIA_GLYPHS: Record<MediaKind, (color: string) => string> = {
	playlist: (c) => `<g stroke="${c}" stroke-width="6" stroke-linecap="round"><path d="M34 46 h56 M34 66 h56 M34 86 h34"/></g><path d="M98 82 v-24 l16 8" fill="none" stroke="${c}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`,
	radio: (c) => `<circle cx="72" cy="66" r="9" fill="${c}"/><path d="M72 75 v30 M52 46 q-14 20 0 40 M92 46 q14 20 0 40 M40 34 q-22 32 0 64 M104 34 q22 32 0 64" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`,
};

/** A playlist's or station's artwork and name; a coloured frame while the player is on it. */
export function mediaKey(kind: MediaKind, name: string | null, art: Artwork | undefined, itemName: string | null, playing: "playing" | "loaded" | false, enabled: boolean, showCaption = true): string {
	let body = picture(art);
	if (!art) body += MEDIA_GLYPHS[kind](enabled ? COLORS.idle : COLORS.disabled);
	if (showCaption && itemName) body += `<rect y="108" width="144" height="36" fill="#000000" opacity="0.6"/>` + label(itemName, 131, 15, enabled ? COLORS.text : COLORS.secondary, 700);
	if (name !== null) body += `<rect width="144" height="26" fill="#000000" opacity="0.5"/>` + label(name, 19, 13, COLORS.secondary, 600);
	if (playing) body += `<rect x="3" y="3" width="138" height="138" rx="14" fill="none" stroke="${playing === "playing" ? COLORS.playing : COLORS.paused}" stroke-width="6"/>`;
	if (!enabled) body += `<rect width="144" height="144" fill="#000000" opacity="0.45"/>`;
	return svg(body);
}

/** Artwork as a data URL, for a dial's icon. */
export function artworkURL(art: Artwork | undefined): string | undefined {
	return art ? `data:${art.type};base64,${art.data.toString("base64")}` : undefined;
}

/** A speaker glyph as a data URL, for the volume dial's icon. */
export function speakerIcon(muted: boolean): string {
	const color = muted ? COLORS.paused : COLORS.accent;
	const waves = muted ? `<path d="M40 22 l14 20 M54 22 l-14 20" stroke="${color}" stroke-width="5" stroke-linecap="round"/>` : `<path d="M40 24 q8 8 0 16 M48 18 q14 14 0 28" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>`;
	const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path d="M10 24 h10 l12 -10 v36 l-12 -10 h-10 z" fill="${color}"/>${waves}</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(markup)}`;
}

/** A small green tick in the top-right corner of a key image, as a quiet "done". */
export function withTick(image: string): string {
	const prefix = "data:image/svg+xml;charset=utf8,";
	if (!image.startsWith(prefix)) return image;
	const markup = decodeURIComponent(image.slice(prefix.length));
	const badge = `<circle cx="126" cy="18" r="13" fill="${COLORS.playing}" stroke="#000000" stroke-opacity="0.35" stroke-width="2"/><path d="M119 18.5 l5 5 l9 -11" fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`;
	return prefix + encodeURIComponent(markup.replace(/<\/svg>\s*$/, `${badge}</svg>`));
}

import { action, type DialDownEvent, type DialRotateEvent, type DidReceiveSettingsEvent, type KeyDownEvent, type TouchTapEvent, type WillAppearEvent } from "@elgato/streamdeck";

import { SELECTED } from "../ma/session";
import { artworkURL, overflows, selectKey, stateColor } from "../render";
import { canTransport, nowPlayingOf, playbackState, selectPlayer, session, volumeOf } from "../shared";
import { PlayerAction, type KeyContext, type PlayerSettings } from "./base";

type Settings = PlayerSettings & {
	/** A room button for one player (default), or a key that steps through a list. */
	mode?: "pick" | "cycle";
	/** The players a cycling key steps through, in the order ticked. */
	players?: string[];
	/** Leave the "3 / 4" off a cycling key. */
	hidePosition?: boolean;
	/** Show the player's state as a border around the key instead of a dot. */
	stateStyle?: "dot" | "border";
	/** Scroll detail lines that don't fit (default on). */
	scroll?: boolean;
	/** The two lines under the name: track then artist, artist then track, source then track, or nothing. */
	detail?: "track" | "artist" | "source" | "none";
};

/**
 * Chooses a deck's player, for every key on that deck set to "Selected on this deck". As a
 * key it's either a room button (press to select one player, framed while selected) or a
 * cycling key that steps through a chosen list on each press and shows who's current. On
 * a Stream Deck+ dial, turning steps through every player and the strip shows the selected
 * one's now playing; press plays or pauses it.
 */
@action({ UUID: "media.tallack.roadie.select" })
export class SelectPlayerAction extends PlayerAction<Settings> {
	protected override tick = 2000;
	// A room button names its own player; it mustn't hand that to other kinds of key.
	protected override sharesPlayer = false;

	constructor() {
		super();
		session.on("selected", () => this.redrawAll());
	}

	override onWillAppear(ev: WillAppearEvent<Settings>): void {
		super.onWillAppear(ev);
		void this.follow(ev);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): void {
		super.onDidReceiveSettings(ev);
		void this.follow(ev);
	}

	/**
	 * Dials and cycling keys show the deck's selection, so they read the `selected` player;
	 * a room button must name a player of its own, so it drops `selected` when switched back.
	 */
	private async follow(ev: { action: WillAppearEvent<Settings>["action"]; payload: { settings: Settings } }): Promise<void> {
		const follows = ev.action.isDial() || ev.payload.settings.mode === "cycle";
		const playerId = follows ? SELECTED : ev.payload.settings.playerId === SELECTED ? undefined : ev.payload.settings.playerId;
		if (playerId === ev.payload.settings.playerId) return;
		const settings = { ...ev.payload.settings, playerId };
		this.visible.set(ev.action.id, { action: ev.action, settings });
		await ev.action.setSettings(settings).catch(() => undefined);
		await this.redraw(ev.action.id);
	}

	/** The lines under the name, as the key is set to show them; null hides them. */
	private details(playing: ReturnType<typeof nowPlayingOf>, detail: NonNullable<Settings["detail"]>): string[] | null {
		const { track, artist, source } = playing;
		if (detail === "none") return null;
		if (!track && !source) return [];
		switch (detail) {
			case "artist":
				return [artist ?? track ?? "", artist ? (track ?? "") : ""];
			case "source":
				return [source ?? track ?? "", source ? [artist, track].filter(Boolean).join(" – ") : ""];
			default:
				return [track ?? source ?? "", track ? (artist ?? "") : ""];
		}
	}

	/** The cycling key's list, in ticked order, keeping only players that still exist. */
	private cycle(settings: Settings): string[] {
		return (settings.players ?? []).filter((id) => session.players.has(id));
	}

	protected override async draw({ action, settings, player, queue, device }: KeyContext<Settings>): Promise<void> {
		const state = playbackState(player, queue);
		const item = queue?.current_item;
		const playing = nowPlayingOf(player, queue);
		if (action.isKey()) {
			const details = this.details(playing, settings.detail ?? "track");
			const border = settings.stateStyle === "border";
			const scroll = settings.scroll !== false;
			this.animate(action.id, scroll && !!details && details.some((line) => overflows(line, 13)));
			if (settings.mode === "cycle") {
				const list = this.cycle(settings);
				const at = list.indexOf(player.player_id);
				const position = settings.hidePosition ? undefined : list.length ? `${at < 0 ? "–" : at + 1} / ${list.length}` : "No players ticked";
				this.setImage(action, selectKey(player.name, state, player.available, details, { selected: false, position, border, scroll }));
			} else {
				this.setImage(action, selectKey(player.name, state, player.available, details, { selected: session.selectedFor(device) === player.player_id, border, scroll }));
			}
		} else if (action.isDial()) {
			const art = await session.artwork(item?.media_item ?? item, item ? undefined : player.current_media?.image_url);
			this.setFeedback(action, {
				title: player.name,
				value: playing.track ? (playing.artist ? `${playing.track} · ${playing.artist}` : playing.track) : state === "idle" ? "Idle" : "",
				icon: artworkURL(art) ?? "imgs/actions/select",
				indicator: { value: volumeOf(player).level ?? 0, bar_fill_c: stateColor(state, player.available) },
			});
		}
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const device = ev.action.device.id;
		if (ev.payload.settings.mode === "cycle") {
			const list = this.cycle(ev.payload.settings);
			if (list.length === 0) return void (await ev.action.showAlert());
			const at = list.indexOf(session.selectedFor(device) ?? "");
			selectPlayer(list[(at + 1) % list.length], device);
			return;
		}
		const id = ev.payload.settings.playerId;
		const player = id && id !== SELECTED ? session.player(id) : undefined;
		if (!player) return void (await ev.action.showAlert());
		selectPlayer(player.player_id, device);
	}

	/** Steps through the players in name order. */
	override async onDialRotate(ev: DialRotateEvent<Settings>): Promise<void> {
		const device = ev.action.device.id;
		const players = session.playerList();
		if (players.length === 0) return;
		const current = players.findIndex((player) => player.player_id === session.selectedFor(device));
		const next = ((((current < 0 ? 0 : current) + ev.payload.ticks) % players.length) + players.length) % players.length;
		selectPlayer(players[next].player_id, device);
	}

	override async onDialDown(ev: DialDownEvent<Settings>): Promise<void> {
		await this.playPause(ev);
	}

	override async onTouchTap(ev: TouchTapEvent<Settings>): Promise<void> {
		await this.playPause(ev);
	}

	private async playPause(ev: DialDownEvent<Settings> | TouchTapEvent<Settings>): Promise<void> {
		const context = this.context(ev);
		if (!context || !canTransport(context.player, context.queue, "pause")) return;
		await this.run(ev.action, () => session.command("players/cmd/play_pause", { player_id: context.player.player_id }));
	}
}

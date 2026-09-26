import { action, type DialDownEvent, type DialRotateEvent, type DidReceiveSettingsEvent, type KeyDownEvent, type TouchTapEvent, type WillAppearEvent } from "@elgato/streamdeck";

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
 * Chooses the deck's player, for every key set to "Selected on this deck". As a key it's
 * either a room button (press to select one player, framed while selected) or a cycling
 * key that steps through a chosen list on each press and shows who's current. On a
 * Stream Deck+ dial, turning steps through every player and the strip shows the selected
 * one's now playing; press plays or pauses it.
 */
@action({ UUID: "media.tallack.roadie.select" })
export class SelectPlayerAction extends PlayerAction<Settings> {
	protected override tick = 2000;
	// A room button's player, or a cycling key's list, is that key's own business.
	protected override remembers = false;

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

	/** Dials and cycling keys show the selection itself, so they read the `selected` player. */
	private async follow(ev: { action: WillAppearEvent<Settings>["action"]; payload: { settings: Settings } }): Promise<void> {
		const follows = ev.action.isDial() || ev.payload.settings.mode === "cycle";
		if (follows && ev.payload.settings.playerId !== "selected") {
			const settings = { ...ev.payload.settings, playerId: "selected" };
			this.visible.set(ev.action.id, { action: ev.action, settings });
			await ev.action.setSettings(settings);
			await this.redraw(ev.action.id);
		}
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

	protected override async draw({ action, settings, player, queue }: KeyContext<Settings>): Promise<void> {
		const state = playbackState(player, queue);
		const item = queue?.current_item;
		const playing = nowPlayingOf(player, queue);
		const title = playing.track ?? playing.source;
		if (action.isKey()) {
			const details = this.details(playing, settings.detail ?? "track");
			const border = settings.stateStyle === "border";
			const scroll = settings.scroll !== false;
			this.animate(action.id, scroll && !!details && details.some((line) => overflows(line, 13)));
			if (settings.mode === "cycle") {
				const list = this.cycle(settings);
				const at = list.indexOf(player.player_id);
				const position = settings.hidePosition ? undefined : list.length ? `${at < 0 ? "–" : at + 1} / ${list.length}` : "No players ticked";
				await this.setImage(action, selectKey(player.name, state, player.available, details, { selected: false, position, border, scroll }));
			} else {
				await this.setImage(action, selectKey(player.name, state, player.available, details, { selected: session.selectedPlayerId === player.player_id, border, scroll }));
			}
		} else if (action.isDial()) {
			const art = await session.artwork(item?.media_item ?? item, item ? undefined : player.current_media?.image_url);
			await action.setFeedback({
				title: player.name,
				value: playing.track ? (playing.artist ? `${playing.track} · ${playing.artist}` : playing.track) : state === "idle" ? "Idle" : "",
				icon: artworkURL(art) ?? "imgs/actions/select",
				indicator: { value: volumeOf(player).level ?? 0, bar_fill_c: stateColor(state, player.available) },
			});
		}
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		if (ev.payload.settings.mode === "cycle") {
			const list = this.cycle(ev.payload.settings);
			if (list.length === 0) return void (await ev.action.showAlert());
			const at = list.indexOf(session.selectedPlayerId ?? "");
			selectPlayer(list[(at + 1) % list.length]);
			return;
		}
		const id = ev.payload.settings.playerId;
		const player = id && id !== "selected" ? session.player(id) : undefined;
		if (!player) return void (await ev.action.showAlert());
		selectPlayer(player.player_id);
	}

	/** Steps through the players in name order. */
	override async onDialRotate(ev: DialRotateEvent<Settings>): Promise<void> {
		const players = session.playerList();
		if (players.length === 0) return;
		const current = players.findIndex((player) => player.player_id === session.selectedPlayerId);
		const next = ((((current < 0 ? 0 : current) + ev.payload.ticks) % players.length) + players.length) % players.length;
		selectPlayer(players[next].player_id);
	}

	override async onDialDown(ev: DialDownEvent<Settings>): Promise<void> {
		await this.playPause(ev.action.id);
	}

	override async onTouchTap(ev: TouchTapEvent<Settings>): Promise<void> {
		await this.playPause(ev.action.id);
	}

	private async playPause(id: string): Promise<void> {
		const context = this.context(id);
		if (!context || !canTransport(context.player, context.queue, "pause")) return;
		await this.run(context.action, () => session.command("players/cmd/play_pause", { player_id: context.player.player_id }));
	}
}

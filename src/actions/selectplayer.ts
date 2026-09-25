import { action, type DialDownEvent, type DialRotateEvent, type KeyDownEvent, type TouchTapEvent, type WillAppearEvent } from "@elgato/streamdeck";

import { artworkURL, selectKey, stateColor } from "../render";
import { canTransport, playbackState, selectPlayer, session, volumeOf } from "../shared";
import { PlayerAction, type KeyContext, type PlayerSettings } from "./base";

/**
 * Chooses the deck's player, for every key set to "Selected on this deck". As a key it's a
 * room button: press to select, framed while selected. On a Stream Deck+ dial, turning
 * steps through the players and the strip shows the selected one's now playing; press
 * plays or pauses it.
 */
@action({ UUID: "media.tallack.roadie.select" })
export class SelectPlayerAction extends PlayerAction {
	protected override tick = 2000;

	constructor() {
		super();
		session.on("selected", () => this.redrawAll());
	}

	override onWillAppear(ev: WillAppearEvent<PlayerSettings>): void {
		super.onWillAppear(ev);
		// A dial follows the selection itself; it doesn't need a player of its own.
		if (ev.action.isDial() && ev.payload.settings.playerId !== "selected") void ev.action.setSettings({ ...ev.payload.settings, playerId: "selected" });
	}

	protected override async draw({ action, player, queue }: KeyContext<PlayerSettings>): Promise<void> {
		const state = playbackState(player, queue);
		const item = queue?.current_item;
		const title = item?.media_item?.name ?? item?.name ?? player.current_media?.title ?? null;
		if (action.isKey()) {
			await this.setImage(action, selectKey(player.name, state, player.available, session.selectedPlayerId === player.player_id, title));
		} else if (action.isDial()) {
			const artist = item?.media_item?.artists?.map((artist) => artist.name).join(", ") ?? player.current_media?.artist ?? null;
			const art = await session.artwork(item?.media_item ?? item, item ? undefined : player.current_media?.image_url);
			await action.setFeedback({
				title: player.name,
				value: title ? (artist ? `${title} · ${artist}` : title) : state === "idle" ? "Idle" : "",
				icon: artworkURL(art) ?? "imgs/actions/select",
				indicator: { value: volumeOf(player).level ?? 0, bar_fill_c: stateColor(state, player.available) },
			});
		}
	}

	override async onKeyDown(ev: KeyDownEvent<PlayerSettings>): Promise<void> {
		const id = ev.payload.settings.playerId;
		const player = id && id !== "selected" ? session.player(id) : undefined;
		if (!player) return void (await ev.action.showAlert());
		selectPlayer(player.player_id);
	}

	/** Steps through the players in name order. */
	override async onDialRotate(ev: DialRotateEvent<PlayerSettings>): Promise<void> {
		const players = session.playerList();
		if (players.length === 0) return;
		const current = players.findIndex((player) => player.player_id === session.selectedPlayerId);
		const next = ((((current < 0 ? 0 : current) + ev.payload.ticks) % players.length) + players.length) % players.length;
		selectPlayer(players[next].player_id);
	}

	override async onDialDown(ev: DialDownEvent<PlayerSettings>): Promise<void> {
		await this.playPause(ev.action.id);
	}

	override async onTouchTap(ev: TouchTapEvent<PlayerSettings>): Promise<void> {
		await this.playPause(ev.action.id);
	}

	private async playPause(id: string): Promise<void> {
		const context = this.context(id);
		if (!context || !canTransport(context.player, context.queue, "pause")) return;
		await this.run(context.action, () => session.command("players/cmd/play_pause", { player_id: context.player.player_id }));
	}
}

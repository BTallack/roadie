import { action, type DialDownEvent, type DialRotateEvent, type KeyDownEvent, type TouchTapEvent } from "@elgato/streamdeck";

import { artworkURL, nowPlayingKey, overflows, stateColor } from "../render";
import { canTransport, playbackState, session, volumeOf } from "../shared";
import { PlayerAction, type KeyContext, type PlayerSettings } from "./base";

type Settings = PlayerSettings & {
	/** Scroll a title or artist that doesn't fit (default on). */
	scroll?: boolean;
};

/**
 * A player at a glance: artwork, title and artist, a state dot, and a progress bar that
 * moves between the server's updates. Press to play or pause. On a Stream Deck+ dial it
 * fills the strip; turning the dial changes the volume.
 */
@action({ UUID: "media.tallack.roadie.nowplaying" })
export class NowPlayingAction extends PlayerAction<Settings> {
	protected override tick = 1000;

	protected override async draw({ action, settings, player, queue, name, caption }: KeyContext<Settings>): Promise<void> {
		const state = playbackState(player, queue);
		const item = queue?.current_item;
		const media = player.current_media;
		const title = item?.media_item?.name ?? (item ? item.name : null) ?? media?.title ?? null;
		const artist = item?.media_item?.artists?.map((artist) => artist.name).join(", ") ?? media?.artist ?? null;
		const art = await session.artwork(item?.media_item ?? item, item ? undefined : media?.image_url);
		const progress = session.progress(queue);
		if (action.isKey()) {
			const scroll = settings.scroll !== false;
			this.animate(action.id, scroll && caption && (overflows(title, 15) || overflows(artist, 13)));
			await this.setImage(action, nowPlayingKey(name, art, { title, artist, state, available: player.available, progress, caption, scroll }));
		} else if (action.isDial()) {
			const { level } = volumeOf(player);
			await action.setFeedback({
				title: title ?? player.name,
				value: artist ?? (title ? player.name : state === "idle" ? "Idle" : ""),
				icon: artworkURL(art) ?? "imgs/actions/nowplaying",
				indicator: { value: level ?? 0, bar_fill_c: stateColor(state, player.available) },
			});
		}
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		await this.playPause(ev.action.id);
	}

	override async onDialDown(ev: DialDownEvent<Settings>): Promise<void> {
		await this.playPause(ev.action.id);
	}

	override async onTouchTap(ev: TouchTapEvent<Settings>): Promise<void> {
		await this.playPause(ev.action.id);
	}

	override async onDialRotate(ev: DialRotateEvent<Settings>): Promise<void> {
		const context = this.context(ev.action.id);
		if (!context) return;
		const { level, group } = volumeOf(context.player);
		if (level === null) return;
		const target = Math.max(0, Math.min(100, Math.round(level + ev.payload.ticks * 2)));
		if (group) context.player.group_volume = target;
		else context.player.volume_level = target;
		await this.draw(context);
		await this.run(ev.action, () => session.command(group ? "players/cmd/group_volume" : "players/cmd/volume_set", { player_id: context.player.player_id, volume_level: target }));
	}

	private async playPause(id: string): Promise<void> {
		const context = this.context(id);
		if (!context || !canTransport(context.player, context.queue, "pause")) {
			const entry = this.visible.get(id)?.action;
			if (entry?.isKey() || entry?.isDial()) await entry.showAlert();
			return;
		}
		await this.run(context.action, () => session.command("players/cmd/play_pause", { player_id: context.player.player_id }));
	}
}

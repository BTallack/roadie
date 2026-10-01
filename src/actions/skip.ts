import { action, type KeyDownEvent } from "@elgato/streamdeck";

import { skipKey } from "../render";
import { playbackState, session } from "../shared";
import { PlayerAction, type KeyContext, type PlayerSettings } from "./base";

type Settings = PlayerSettings & {
	/** Back (default) or forward. */
	direction?: "back" | "forward";
	/** How far, in seconds. */
	seconds?: number | string;
};

/** Seconds to skip, signed: negative goes back. Defaults to back 15, forward 30. */
function secondsOf(settings: Settings): number {
	const forward = settings.direction === "forward";
	const raw = Number(settings.seconds);
	const seconds = Number.isFinite(raw) && raw > 0 ? Math.min(Math.round(raw), 600) : forward ? 30 : 15;
	return forward ? seconds : -seconds;
}

/**
 * Skips back or ahead within the current track, for podcasts and audiobooks especially.
 * Greyed out for live streams (no duration) and when Music Assistant isn't the source.
 */
@action({ UUID: "media.tallack.roadie.skip" })
export class SkipAction extends PlayerAction<Settings> {
	protected override async draw({ action, settings, player, queue, name, caption }: KeyContext<Settings>): Promise<void> {
		this.setImage(action, skipKey(name, secondsOf(settings), this.canSkip(player, queue), caption));
	}

	private canSkip(player: KeyContext<Settings>["player"], queue: KeyContext<Settings>["queue"]): boolean {
		const state = playbackState(player, queue);
		return player.available && !!queue && !!queue.current_item?.duration && (state === "playing" || state === "paused");
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const context = this.context(ev);
		if (!context?.queue || !this.canSkip(context.player, context.queue)) return void (await ev.action.showAlert());
		await this.run(ev.action, () => session.command("player_queues/skip", { queue_id: context.queue!.queue_id, seconds: secondsOf(ev.payload.settings) }));
	}
}

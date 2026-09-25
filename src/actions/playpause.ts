import { action, type KeyDownEvent } from "@elgato/streamdeck";

import { playPauseKey } from "../render";
import { canTransport, playbackState, session } from "../shared";
import { PlayerAction, type KeyContext } from "./base";

/** Play while paused or idle, pause while playing; grey when the player can't. */
@action({ UUID: "media.tallack.roadie.playpause" })
export class PlayPauseAction extends PlayerAction {
	protected override async draw({ action, player, queue, name, caption }: KeyContext<never>): Promise<void> {
		if (action.isKey()) await this.setImage(action, playPauseKey(name, playbackState(player, queue), canTransport(player, queue, "pause"), caption));
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const context = this.context(ev.action.id);
		if (!context || !canTransport(context.player, context.queue, "pause")) return void (await ev.action.showAlert());
		await this.run(ev.action, () => session.command("players/cmd/play_pause", { player_id: context.player.player_id }));
	}
}

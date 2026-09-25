import { action, type KeyDownEvent } from "@elgato/streamdeck";

import { transportKey } from "../render";
import { canTransport, playbackState, session } from "../shared";
import { PlayerAction, type KeyContext } from "./base";

@action({ UUID: "media.tallack.roadie.stop" })
export class StopAction extends PlayerAction {
	protected override async draw({ action, player, queue, name, caption }: KeyContext<never>): Promise<void> {
		const state = playbackState(player, queue);
		const enabled = canTransport(player, queue, "pause") && (state === "playing" || state === "paused");
		if (action.isKey()) await this.setImage(action, transportKey("stop", name, enabled, caption));
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const context = this.context(ev.action.id);
		if (!context || !canTransport(context.player, context.queue, "pause")) return void (await ev.action.showAlert());
		await this.run(ev.action, () => session.command("players/cmd/stop", { player_id: context.player.player_id }));
	}
}

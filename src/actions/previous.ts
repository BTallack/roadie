import { action, type KeyDownEvent } from "@elgato/streamdeck";

import { transportKey } from "../render";
import { canTransport, playbackState, session } from "../shared";
import { PlayerAction, type KeyContext } from "./base";

@action({ UUID: "media.tallack.roadie.previous" })
export class PreviousAction extends PlayerAction {
	protected override async draw({ action, player, queue, name, caption }: KeyContext<never>): Promise<void> {
		const state = playbackState(player, queue);
		const enabled = canTransport(player, queue, "next_previous") && (state === "playing" || state === "paused");
		if (action.isKey()) await action.setImage(transportKey("previous", name, enabled, caption));
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const context = this.context(ev.action.id);
		if (!context || !canTransport(context.player, context.queue, "next_previous")) return void (await ev.action.showAlert());
		await this.run(ev.action, () => session.command("players/cmd/previous", { player_id: context.player.player_id }));
	}
}

import { action, type KeyDownEvent } from "@elgato/streamdeck";

import { transferKey } from "../render";
import { session } from "../shared";
import { PlayerAction, type KeyContext, type PlayerSettings } from "./base";

type Settings = PlayerSettings & {
	/** Where the queue goes. */
	targetId?: string;
};

/** Moves the player's queue to another player, playing on if it was playing. */
@action({ UUID: "media.tallack.roadie.transfer" })
export class TransferAction extends PlayerAction<Settings> {
	protected override async draw({ action, settings, player, queue, name, caption }: KeyContext<Settings>): Promise<void> {
		const target = session.player(settings.targetId);
		await this.setImage(action, transferKey(name, target?.name ?? null, !!target && !!queue && queue.items > 0 && target.available && player.available, caption));
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const context = this.context(ev.action.id);
		const target = session.player(ev.payload.settings.targetId);
		if (!context?.queue || !target) return void (await ev.action.showAlert());
		await this.run(ev.action, () => session.command("player_queues/transfer", { source_queue_id: context.queue!.queue_id, target_queue_id: target.player_id }));
	}
}

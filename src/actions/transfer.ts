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
	protected override async draw({ action, settings, player, queue, name, caption, device }: KeyContext<Settings>): Promise<void> {
		const target = session.player(settings.targetId, device);
		const enabled = !!target && !!queue && queue.items > 0 && target.player_id !== queue.queue_id && target.available && player.available;
		this.setImage(action, transferKey(name, target?.name ?? null, enabled, caption));
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const context = this.context(ev);
		const target = session.player(ev.payload.settings.targetId, ev.action.device.id);
		if (!context?.queue || !target || target.player_id === context.queue.queue_id) return void (await ev.action.showAlert());
		await this.run(ev.action, () => session.command("player_queues/transfer", { source_queue_id: context.queue!.queue_id, target_queue_id: target.player_id }));
	}
}

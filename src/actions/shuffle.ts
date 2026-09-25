import { action, type KeyDownEvent } from "@elgato/streamdeck";

import { shuffleKey } from "../render";
import { session } from "../shared";
import { PlayerAction, type KeyContext } from "./base";

/** Toggles shuffle on the player's queue; grey when Music Assistant isn't the source or the queue is a dynamic mix. */
@action({ UUID: "media.tallack.roadie.shuffle" })
export class ShuffleAction extends PlayerAction {
	protected override async draw({ action, queue, name, caption }: KeyContext<never>): Promise<void> {
		await this.setImage(action, shuffleKey(name, queue?.shuffle_enabled === true, !!queue && !queue.is_dynamic, caption));
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const context = this.context(ev.action.id);
		const queue = context?.queue;
		if (!queue || queue.is_dynamic) return void (await ev.action.showAlert());
		await this.run(ev.action, () => session.command("player_queues/shuffle", { queue_id: queue.queue_id, shuffle_enabled: !queue.shuffle_enabled }));
	}
}

import { action, type KeyDownEvent } from "@elgato/streamdeck";

import { repeatKey } from "../render";
import { session } from "../shared";
import { PlayerAction, type KeyContext } from "./base";

const CYCLE: Record<string, string> = { off: "all", all: "one", one: "off" };

/** Steps repeat through off, all and one on the player's queue. */
@action({ UUID: "media.tallack.roadie.repeat" })
export class RepeatAction extends PlayerAction {
	protected override async draw({ action, queue, name, caption }: KeyContext<never>): Promise<void> {
		await this.setImage(action, repeatKey(name, queue?.repeat_mode ?? "off", !!queue && !queue.is_dynamic, caption));
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const context = this.context(ev.action.id);
		const queue = context?.queue;
		if (!queue || queue.is_dynamic) return void (await ev.action.showAlert());
		await this.run(ev.action, () => session.command("player_queues/repeat", { queue_id: queue.queue_id, repeat_mode: CYCLE[queue.repeat_mode] ?? "off" }));
	}
}

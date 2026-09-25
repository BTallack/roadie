import { action, type KeyDownEvent } from "@elgato/streamdeck";

import { groupKey } from "../render";
import { session } from "../shared";
import { PlayerAction, type KeyContext, type PlayerSettings } from "./base";

type Settings = PlayerSettings & {
	/** The player to join: a sync leader or a group player. */
	targetId?: string;
};

/** Joins the player to a target (or leaves it); lit while grouped. */
@action({ UUID: "media.tallack.roadie.group" })
export class GroupAction extends PlayerAction<Settings> {
	protected override async draw({ action, settings, player, name, caption }: KeyContext<Settings>): Promise<void> {
		const target = session.player(settings.targetId);
		const grouped = !!target && session.isGrouped(player, target);
		await this.setImage(action, groupKey(name, target?.name ?? null, grouped, !!target && player.available && target.available, caption));
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const context = this.context(ev.action.id);
		const target = session.player(ev.payload.settings.targetId);
		if (!context || !target || !context.player.available) return void (await ev.action.showAlert());
		const grouped = session.isGrouped(context.player, target);
		await this.run(ev.action, () =>
			grouped
				? session.command("players/cmd/ungroup", { player_id: context.player.player_id })
				: session.command("players/cmd/group", { player_id: context.player.player_id, target_player: target.player_id }),
		);
	}
}

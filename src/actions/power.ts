import { action, type KeyDownEvent } from "@elgato/streamdeck";

import { hasPower } from "../ma/playing";
import { powerKey } from "../render";
import { session } from "../shared";
import { PlayerAction, type KeyContext, type PlayerSettings } from "./base";

type Settings = PlayerSettings & {
	/** Toggle (default), or always turn on, or always turn off. */
	mode?: "toggle" | "on" | "off";
};

/**
 * Turns a player on or off: Chromecasts, AirPlay and Home Assistant players and the like.
 * Players without power control (Sonos, for one) show the key greyed out.
 */
@action({ UUID: "media.tallack.roadie.power" })
export class PowerAction extends PlayerAction<Settings> {
	protected override async draw({ action, settings, player, name, caption }: KeyContext<Settings>): Promise<void> {
		this.setImage(action, powerKey(name, hasPower(player) ? player.powered === true : null, settings.mode ?? "toggle", caption));
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const context = this.context(ev);
		if (!context || !hasPower(context.player) || !context.player.available) return void (await ev.action.showAlert());
		const mode = ev.payload.settings.mode ?? "toggle";
		const powered = mode === "on" ? true : mode === "off" ? false : context.player.powered !== true;
		await this.run(ev.action, () => session.command("players/cmd/power", { player_id: context.player.player_id, powered }));
	}
}

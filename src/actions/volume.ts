import { action, type DialDownEvent, type DialRotateEvent, type KeyDownEvent, type TouchTapEvent } from "@elgato/streamdeck";

import { speakerIcon, volumeKey, type VolumeMode, type VolumeStyle } from "../render";
import { session, volumeOf } from "../shared";
import { PlayerAction, type KeyContext, type PlayerSettings } from "./base";

type Settings = PlayerSettings & {
	/** What a key press does; a dial always turns for volume and presses to mute. */
	mode?: VolumeMode;
	/** Sound waves (one for down, three for up, none for mute) or plus and minus signs. */
	style?: VolumeStyle;
};

/** Louder, quieter, mute, or the level on an arc; dials turn. Groups use the group volume. */
@action({ UUID: "media.tallack.roadie.volume" })
export class VolumeAction extends PlayerAction<Settings> {
	protected override async draw({ action, settings, player, name, caption }: KeyContext<Settings>): Promise<void> {
		const { level, muted } = volumeOf(player);
		if (action.isKey()) {
			await this.setImage(action, volumeKey(name, level, muted, settings.mode ?? "up", caption, settings.style ?? "waves"));
		} else if (action.isDial()) {
			await action.setFeedback({
				title: player.name,
				value: level === null ? "–" : muted ? "Muted" : `${Math.round(level)}%`,
				icon: speakerIcon(muted),
				indicator: { value: level ?? 0, bar_fill_c: muted ? "#FFD60A" : "#5AC8FA" },
			});
		}
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const context = this.context(ev.action.id);
		if (!context) return void (await ev.action.showAlert());
		const { level, muted, group } = volumeOf(context.player);
		const mode = ev.payload.settings.mode ?? "up";
		if (level === null) return void (await ev.action.showAlert());
		if (mode === "level") return;
		const mutes = mode === "mute" || mode === "level_mute";
		const command = mutes ? "players/cmd/volume_mute" : group ? `players/cmd/group_volume_${mode}` : `players/cmd/volume_${mode}`;
		const args = mutes ? { player_id: context.player.player_id, muted: !muted } : { player_id: context.player.player_id };
		await this.run(ev.action, () => session.command(command, args));
	}

	override async onDialRotate(ev: DialRotateEvent<Settings>): Promise<void> {
		const context = this.context(ev.action.id);
		if (!context) return;
		const { level, group } = volumeOf(context.player);
		if (level === null) return;
		const target = Math.max(0, Math.min(100, Math.round(level + ev.payload.ticks * 2)));
		// Draw the new level at once; the server's event confirms it a moment later.
		if (group) context.player.group_volume = target;
		else context.player.volume_level = target;
		await this.draw(context);
		await this.run(ev.action, () => session.command(group ? "players/cmd/group_volume" : "players/cmd/volume_set", { player_id: context.player.player_id, volume_level: target }));
	}

	override async onDialDown(ev: DialDownEvent<Settings>): Promise<void> {
		await this.toggleMute(ev.action.id);
	}

	override async onTouchTap(ev: TouchTapEvent<Settings>): Promise<void> {
		await this.toggleMute(ev.action.id);
	}

	private async toggleMute(id: string): Promise<void> {
		const context = this.context(id);
		if (!context) return;
		await this.run(context.action, () => session.command("players/cmd/volume_mute", { player_id: context.player.player_id, muted: !volumeOf(context.player).muted }));
	}
}

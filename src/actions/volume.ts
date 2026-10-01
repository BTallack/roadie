import { action, type DialDownEvent, type DialRotateEvent, type KeyDownEvent, type TouchTapEvent } from "@elgato/streamdeck";

import type { Player } from "../ma/types";
import { speakerIcon, volumeKey, type VolumeMode, type VolumeStyle } from "../render";
import { session, volumeOf } from "../shared";
import { PlayerAction, type KeyContext, type PlayerSettings } from "./base";

type Settings = PlayerSettings & {
	/** What a key press does; a dial always turns for volume and presses to mute. */
	mode?: VolumeMode;
	/** Sound waves (one for down, three for up, none for mute) or plus and minus signs. */
	style?: VolumeStyle;
	/** The level a "set" key goes to, 0 to 100. */
	preset?: number | string;
};

/** A "set" key's level, 30 when unset or unreadable. */
function presetOf(settings: Settings): number {
	const value = Number(settings.preset);
	return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 30;
}

/** Mutes a player, or a group as a whole (every member, through the server's group command). */
function muteCommand(player: Player, muted: boolean): [string, Record<string, unknown>] {
	return [volumeOf(player).group ? "players/cmd/group_volume_mute" : "players/cmd/volume_mute", { player_id: player.player_id, muted }];
}

/** Louder, quieter, mute, or the level on an arc; dials turn. Groups use the group volume. */
@action({ UUID: "media.tallack.roadie.volume" })
export class VolumeAction extends PlayerAction<Settings> {
	protected override async draw({ action, settings, player, name, caption }: KeyContext<Settings>): Promise<void> {
		const { level, muted } = volumeOf(player);
		if (action.isKey()) {
			this.setImage(action, volumeKey(name, level, muted, settings.mode ?? "up", caption, settings.style ?? "waves", presetOf(settings)));
		} else if (action.isDial()) {
			this.setFeedback(action, {
				title: player.name,
				value: level === null ? "–" : muted ? "Muted" : `${Math.round(level)}%`,
				icon: speakerIcon(muted),
				indicator: { value: level ?? 0, bar_fill_c: muted ? "#FFD60A" : "#5AC8FA" },
			});
		}
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const context = this.context(ev);
		if (!context) return void (await ev.action.showAlert());
		const { level, muted, group } = volumeOf(context.player);
		const mode = ev.payload.settings.mode ?? "up";
		if (level === null) return void (await ev.action.showAlert());
		if (mode === "level") return;
		if (mode === "set") {
			const target = presetOf(ev.payload.settings);
			await this.run(ev.action, () => session.command(group ? "players/cmd/group_volume" : "players/cmd/volume_set", { player_id: context.player.player_id, volume_level: target }));
			return;
		}
		const [command, args] = mode === "mute" || mode === "level_mute" ? muteCommand(context.player, !muted) : [group ? `players/cmd/group_volume_${mode}` : `players/cmd/volume_${mode}`, { player_id: context.player.player_id }];
		await this.run(ev.action, () => session.command(command, args));
	}

	override async onDialRotate(ev: DialRotateEvent<Settings>): Promise<void> {
		const context = this.context(ev);
		if (context) this.turnVolume(context, ev.payload.ticks);
	}

	override async onDialDown(ev: DialDownEvent<Settings>): Promise<void> {
		await this.toggleMute(ev);
	}

	override async onTouchTap(ev: TouchTapEvent<Settings>): Promise<void> {
		await this.toggleMute(ev);
	}

	private async toggleMute(ev: DialDownEvent<Settings> | TouchTapEvent<Settings>): Promise<void> {
		const context = this.context(ev);
		if (!context) return;
		const [command, args] = muteCommand(context.player, !volumeOf(context.player).muted);
		await this.run(ev.action, () => session.command(command, args));
	}
}

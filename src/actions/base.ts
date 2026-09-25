import streamDeck, { SingletonAction, type Action, type DidReceiveSettingsEvent, type SendToPluginEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";

import type { Player, PlayerQueue } from "../ma/types";
import { messageKey, withTick } from "../render";
import { SELECTED } from "../ma/session";
import { connectionSummary, playerItems, rememberDefaults, seedSettings, session } from "../shared";

/** Every key names the player it's about. */
export type PlayerSettings = {
	playerId?: string;
	/** Leave the player's name off the key. */
	hideName?: boolean;
	/** Glyph keys only: the glyph alone, without the words under it. */
	hideCaption?: boolean;
	[key: string]: JsonValue | undefined;
};

/** What a key has to draw from. */
export type KeyContext<T extends PlayerSettings> = {
	action: Action<T>;
	settings: T;
	player: Player;
	/** The queue the player is playing from, when Music Assistant is its source. */
	queue: PlayerQueue | undefined;
	/** The player's name to draw, or null when the key is set to hide it. */
	name: string | null;
	/** Whether glyph keys draw their caption. */
	caption: boolean;
};

/**
 * Shared by every key: remembers each visible key's settings, redraws when the session
 * changes (and on a timer, so progress keeps moving between events), answers the settings
 * panel's player list, and draws the set-up and missing-player messages.
 */
export abstract class PlayerAction<T extends PlayerSettings = PlayerSettings> extends SingletonAction<T> {
	protected readonly visible = new Map<string, { action: Action<T>; settings: T }>();
	/** What each key last drew, so a tick can be laid over it. */
	private readonly lastImage = new Map<string, string>();
	private ticker?: NodeJS.Timeout;
	/** How often visible keys redraw on their own, in ms. */
	protected tick = 30_000;

	constructor() {
		super();
		session.on("change", () => this.redrawAll());
	}

	/** Draws one key once its player is known. */
	protected abstract draw(context: KeyContext<T>): Promise<void> | void;

	override onWillAppear(ev: WillAppearEvent<T>): void {
		let settings = ev.payload.settings;
		// A key just dragged onto a page has no settings: start it from the last ones used,
		// so a profile of keys for the same player takes one pick, not one per key.
		if (Object.keys(settings).length === 0) {
			settings = seedSettings(settings);
			if (Object.keys(settings).length) void ev.action.setSettings(settings);
		}
		this.visible.set(ev.action.id, { action: ev.action, settings });
		if (!this.ticker) this.ticker = setInterval(() => this.redrawAll(), this.tick);
		void this.redraw(ev.action.id);
	}

	override onWillDisappear(ev: WillDisappearEvent<T>): void {
		this.visible.delete(ev.action.id);
		this.lastImage.delete(ev.action.id);
		if (this.visible.size === 0) {
			clearInterval(this.ticker);
			this.ticker = undefined;
		}
		this.didDisappear(ev.action.id);
	}

	/** For keys with state of their own. */
	protected didDisappear(_id: string): void {}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<T>): void {
		this.visible.set(ev.action.id, { action: ev.action, settings: ev.payload.settings });
		rememberDefaults(ev.payload.settings);
		void this.redraw(ev.action.id);
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, T>): Promise<void> {
		const payload = ev.payload as { event?: string } | undefined;
		if (payload?.event === "getPlayers") {
			await streamDeck.ui.sendToPropertyInspector({ event: "getPlayers", items: playerItems() });
		} else if (payload?.event === "getPlayersOnly") {
			await streamDeck.ui.sendToPropertyInspector({ event: "getPlayersOnly", items: playerItems(false) });
		} else if (payload?.event === "getTargets") {
			// Players the key's own player may group with.
			const settings = await ev.action.getSettings();
			const player = session.player(settings.playerId);
			const items = (player ? session.groupTargets(player) : session.playerList()).map((target) => ({ label: target.type === "group" ? `${target.name} (group)` : target.name, value: target.player_id }));
			await streamDeck.ui.sendToPropertyInspector({ event: "getTargets", items });
		} else if (payload?.event === "getConnection") {
			await streamDeck.ui.sendToPropertyInspector({
				event: "connection",
				text: connectionSummary(),
				state: session.state,
				server: session.url ? session.url.replace(/^https?:\/\//, "") : null,
				players: session.playerList().length,
			});
		}
	}

	protected redrawAll(): void {
		for (const id of this.visible.keys()) void this.redraw(id);
	}

	protected async redraw(id: string): Promise<void> {
		const entry = this.visible.get(id);
		if (!entry) return;
		const { action, settings } = entry;
		if (!action.isKey() && !action.isDial()) return;
		const context = this.context(id);
		if (!context) {
			if (action.isKey()) await this.setImage(action, this.placeholder(settings));
			else await action.setFeedback({ title: "Roadie", value: session.state === "unconfigured" ? "Set up" : session.state === "live" ? "Choose player" : connectionSummary() });
			return;
		}
		try {
			await this.draw(context);
		} catch (error) {
			streamDeck.logger.warn(`draw failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/** Draws a key and remembers the image, so `run()` can lay a tick over it. */
	protected async setImage(action: Action<T>, image: string): Promise<void> {
		if (!action.isKey()) return;
		this.lastImage.set(action.id, image);
		await action.setImage(image);
	}

	/** The key's player and queue, or nothing when it can't be drawn yet. */
	protected context(id: string): KeyContext<T> | undefined {
		const entry = this.visible.get(id);
		if (!entry) return undefined;
		const player = session.player(entry.settings.playerId);
		if (!player) return undefined;
		return { action: entry.action, settings: entry.settings, player, queue: session.queueFor(player), name: entry.settings.hideName === true ? null : player.name, caption: entry.settings.hideCaption !== true };
	}

	private placeholder(settings: T): string {
		switch (session.state) {
			case "unconfigured":
				return messageKey("Set up", "in settings");
			case "connecting":
				return messageKey("Connecting", "to Music Assistant");
			case "unauthorized":
				return messageKey("Token", "refused", "#FF9500");
			case "offline":
				if (session.players.size === 0) return messageKey("Offline", "Retrying…", "#FF9500");
		}
		if (!settings.playerId) return messageKey("Choose", "a player");
		if (settings.playerId === SELECTED) return messageKey("No player", "selected yet");
		return messageKey("Not found", "Pick again");
	}

	/**
	 * Runs a command. Success shows a small tick in the key's corner for a moment (not
	 * Stream Deck's full-key overlay); failure shows the alert and logs.
	 */
	protected async run(action: Action<T>, work: () => Promise<unknown>): Promise<boolean> {
		try {
			await work();
			const image = action.isKey() ? this.lastImage.get(action.id) : undefined;
			if (image && action.isKey()) {
				await action.setImage(withTick(image));
				setTimeout(() => void this.redraw(action.id), 800);
			}
			return true;
		} catch (error) {
			streamDeck.logger.warn(`command failed: ${error instanceof Error ? error.message : String(error)}`);
			if (action.isKey() || action.isDial()) await action.showAlert();
			return false;
		}
	}
}

import { action, type KeyDownEvent } from "@elgato/streamdeck";

import type { MediaItem } from "../ma/types";
import { heartKey } from "../render";
import { session } from "../shared";
import { PlayerAction, type KeyContext } from "./base";

/**
 * A heart for what the player is playing: filled when the track is a favourite. Press to
 * add it, or, for a library track already favourited, to take it out again.
 *
 * On a radio stream the queue's item is the station, not the song, so the heart stays
 * open and a press only ever adds: the server finds the song the station is playing.
 * Favourites need library write access, which the guest role lacks; for those tokens the
 * key is greyed out.
 */
@action({ UUID: "media.tallack.roadie.favourite" })
export class FavouriteAction extends PlayerAction {
	/** Library records by URI, for the favourite flag; refreshed when the library changes. */
	private items = new Map<string, Promise<MediaItem | undefined>>();

	constructor() {
		super();
		session.on("library", (uri: string | undefined) => {
			if (uri) this.items.delete(uri);
			else this.items.clear();
			this.redrawAll();
		});
	}

	/** Whether the signed-in user may change favourites (guests may not). */
	private get allowed(): boolean {
		return session.user?.role !== "guest";
	}

	protected override async draw({ action, queue, name, caption }: KeyContext<never>): Promise<void> {
		const current = this.current(queue);
		if (!current || !this.allowed) return this.setImage(action, heartKey(name, null, caption));
		const item = current.radio ? undefined : await this.lookup(current.uri);
		this.setImage(action, heartKey(name, item?.favorite === true, caption));
	}

	/** What's playing from Music Assistant, or nothing when idle or on another source. */
	private current(queue: KeyContext<never>["queue"]): { uri: string; radio: boolean } | undefined {
		const media = queue?.current_item?.media_item;
		if (!media?.uri || !queue || queue.state === "idle") return undefined;
		return { uri: media.uri, radio: media.media_type === "radio" };
	}

	private lookup(uri: string): Promise<MediaItem | undefined> {
		let pending = this.items.get(uri);
		if (!pending) {
			pending = session.item(uri).catch(() => {
				this.items.delete(uri);
				return undefined;
			});
			this.items.set(uri, pending);
			if (this.items.size > 32) this.items.delete(this.items.keys().next().value!);
		}
		return pending;
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const context = this.context(ev);
		const current = this.current(context?.queue);
		if (!context || !current || !this.allowed) return void (await ev.action.showAlert());
		const item = current.radio ? undefined : await this.lookup(current.uri);
		const done = await this.run(ev.action, async () => {
			if (item?.favorite && item.provider === "library") {
				await session.command("music/favorites/remove_item", { media_type: item.media_type, library_item_id: item.item_id });
			} else {
				await session.command("players/add_currently_playing_to_favorites", { player_id: context.player.player_id });
			}
		});
		if (done) {
			this.items.delete(current.uri);
			setTimeout(() => this.redrawAll(), 500);
		}
	}
}

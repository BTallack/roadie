import { action, type KeyDownEvent } from "@elgato/streamdeck";

import type { MediaItem } from "../ma/types";
import { heartKey } from "../render";
import { session } from "../shared";
import { PlayerAction, type KeyContext } from "./base";

/**
 * A heart for what the player is playing: filled when it's a favourite. Press to add it
 * (Music Assistant resolves radio streams to the track playing) or, for a library track,
 * to take it out again. Needs a user with library write access (the `user` role).
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

	protected override async draw({ action, queue, name, caption }: KeyContext<never>): Promise<void> {
		const uri = this.currentUri(queue);
		const item = uri ? await this.lookup(uri) : undefined;
		await this.setImage(action, heartKey(name, uri ? item?.favorite === true : null, caption));
	}

	private currentUri(queue: KeyContext<never>["queue"]): string | undefined {
		const media = queue?.current_item?.media_item;
		if (!media?.uri || queue?.state === "idle") return undefined;
		// A radio stream's favourite is the station itself; the track playing on it is what gets added.
		return media.uri;
	}

	private lookup(uri: string): Promise<MediaItem | undefined> {
		let pending = this.items.get(uri);
		if (!pending) {
			pending = session.item(uri).catch(() => undefined);
			this.items.set(uri, pending);
			if (this.items.size > 32) this.items.delete(this.items.keys().next().value!);
		}
		return pending;
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const context = this.context(ev.action.id);
		const uri = this.currentUri(context?.queue);
		if (!context || !uri) return void (await ev.action.showAlert());
		const item = await this.lookup(uri);
		const done = await this.run(ev.action, async () => {
			if (item?.favorite && item.provider === "library") {
				await session.command("music/favorites/remove_item", { media_type: item.media_type, library_item_id: item.item_id });
			} else {
				await session.command("players/add_currently_playing_to_favorites", { player_id: context.player.player_id });
			}
		});
		if (done) {
			this.items.delete(uri);
			setTimeout(() => this.redrawAll(), 500);
		}
	}
}

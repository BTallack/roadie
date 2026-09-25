import { action } from "@elgato/streamdeck";

import { session } from "../shared";
import { MediaAction } from "./media";

/** Loads an album on a player; the picker names each album's artist and provider. */
@action({ UUID: "media.tallack.roadie.album" })
export class AlbumAction extends MediaAction {
	protected readonly kind = "album" as const;
	protected readonly uriKey = "albumUri" as const;
	protected readonly listEvent = "getAlbums";
	protected choices() {
		return session.albums();
	}
}

import { action } from "@elgato/streamdeck";

import { session } from "../shared";
import { MediaAction } from "./media";

/** Loads a playlist on a player; the picker names each playlist's provider. */
@action({ UUID: "media.tallack.roadie.playlist" })
export class PlaylistAction extends MediaAction {
	protected readonly kind = "playlist" as const;
	protected readonly uriKey = "playlistUri" as const;
	protected readonly listEvent = "getPlaylists";
	protected choices() {
		return session.playlists();
	}
}

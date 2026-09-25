import { action } from "@elgato/streamdeck";

import { session } from "../shared";
import { MediaAction } from "./media";

/** Starts an artist radio: a dynamic mix seeded by one artist (Music Assistant 2.9 and later). */
@action({ UUID: "media.tallack.roadie.artistradio" })
export class ArtistRadioAction extends MediaAction {
	protected readonly kind = "artist" as const;
	protected readonly uriKey = "artistUri" as const;
	protected readonly listEvent = "getArtists";
	protected choices() {
		return session.artists();
	}

	protected override playUri(uri: string): string {
		return `radio_playlist://playlist/${uri}`;
	}
}

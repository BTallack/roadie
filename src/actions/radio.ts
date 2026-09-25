import { action } from "@elgato/streamdeck";

import { session } from "../shared";
import { MediaAction } from "./media";

/** Loads a radio station on a player; the picker groups stations by network. */
@action({ UUID: "media.tallack.roadie.radio" })
export class RadioAction extends MediaAction {
	protected readonly kind = "radio" as const;
	protected readonly uriKey = "radioUri" as const;
	protected readonly listEvent = "getRadios";
	protected choices() {
		return session.radios();
	}
}

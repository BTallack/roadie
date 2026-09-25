/**
 * The slices of Music Assistant's API models the plugin reads. Field names match the
 * server's JSON (snake_case) so the wire format is obvious; see docs/music-assistant-api.md.
 * Anything optional is optional because older servers (schema 28 and up) may omit it.
 */

/** First message the server sends on a WebSocket, and what GET /info returns. */
export type ServerInfo = {
	server_id: string;
	server_version: string;
	schema_version: number;
	min_supported_schema_version: number;
	name?: string | null;
	base_url?: string | null;
	internal_url?: string | null;
	external_url?: string | null;
	homeassistant_addon?: boolean;
	onboard_done?: boolean;
	status?: "starting" | "running" | "stopping" | "stopped";
	has_remote_access?: boolean;
};

export type PlaybackState = "idle" | "paused" | "playing" | string;

export type PlayerFeature = "power" | "volume_set" | "volume_mute" | "pause" | "seek" | "next_previous" | "enqueue" | "play_media" | "set_members" | string;

/** What a player reports it's playing; filled for external sources too. */
export type PlayerMedia = {
	uri: string;
	media_type?: string;
	title?: string | null;
	artist?: string | null;
	album?: string | null;
	image_url?: string | null;
	duration?: number | null;
	source_id?: string | null;
	queue_item_id?: string | null;
};

export type Player = {
	player_id: string;
	provider: string;
	type: "player" | "stereo_pair" | "group" | "protocol" | string;
	name: string;
	available: boolean;
	enabled?: boolean;
	hide_in_ui?: boolean;
	private?: boolean;
	icon?: string;
	supported_features: PlayerFeature[];
	playback_state: PlaybackState;
	powered?: boolean | null;
	volume_level?: number | null;
	volume_muted?: boolean | null;
	group_volume?: number | null;
	group_volume_muted?: boolean | null;
	group_members?: string[];
	can_group_with?: string[];
	synced_to?: string | null;
	active_group?: string | null;
	/** A queue id when Music Assistant is the source, otherwise a native source id. */
	active_source?: string | null;
	current_media?: PlayerMedia | null;
	elapsed_time?: number | null;
	elapsed_time_last_updated?: number | null;
	device_info?: { model?: string; manufacturer?: string };
};

export type MediaItemImage = {
	type: string;
	path: string;
	provider: string;
	remotely_accessible?: boolean;
	/** Opaque id for `${base_url}/imageproxy/${proxy_id}?size=…` (schema 31 and up). */
	proxy_id?: string | null;
};

export type ItemMapping = {
	item_id: string;
	provider: string;
	name: string;
	media_type: string;
	uri?: string | null;
	image?: MediaItemImage | null;
};

export type ProviderMapping = { item_id: string; provider_domain: string; provider_instance: string; available?: boolean };

export type MediaItem = ItemMapping & {
	favorite?: boolean;
	provider_mappings?: ProviderMapping[];
	metadata?: { images?: MediaItemImage[] | null } | null;
	artists?: ItemMapping[];
	album?: ItemMapping | null;
};

export type Playlist = MediaItem & {
	media_type: "playlist";
	owner?: string;
	is_editable?: boolean;
	is_dynamic?: boolean;
};

export type QueueItem = {
	queue_id: string;
	queue_item_id: string;
	name: string;
	duration: number | null;
	index?: number;
	media_item?: MediaItem | null;
	image?: MediaItemImage | null;
	/** For streams: what the station says is playing, usually "Artist - Track". */
	streamdetails?: { stream_title?: string | null } | null;
};

export type RepeatMode = "off" | "one" | "all" | string;

export type PlayerQueue = {
	queue_id: string;
	active: boolean;
	display_name: string;
	available: boolean;
	items: number;
	shuffle_enabled: boolean;
	repeat_mode: RepeatMode;
	state: PlaybackState;
	current_index?: number | null;
	current_item?: QueueItem | null;
	next_item?: QueueItem | null;
	elapsed_time: number;
	elapsed_time_last_updated: number;
	/** What the queue was loaded from (a playlist, album, radio playlist…). */
	sources?: ItemMapping[];
	/** The same on servers from before `sources`. */
	radio_source?: ItemMapping[];
	is_dynamic?: boolean;
	ended?: boolean;
};

export type QueueOption = "play" | "replace" | "next" | "replace_next" | "add";

export type EventType =
	| "player_added"
	| "player_updated"
	| "player_removed"
	| "queue_added"
	| "queue_updated"
	| "queue_items_updated"
	| "queue_time_updated"
	| "media_item_added"
	| "media_item_updated"
	| "media_item_deleted"
	| "auth_session"
	| "core_state_updated"
	| "application_shutdown"
	| string;

/** An event pushed by the server; `object_id` is a player, queue or item id. */
export type MassEvent = { event: EventType; object_id?: string | null; data?: unknown };

/** The thumbnail for a media item, playlist or queue item, in the order the official client looks. */
export function itemImage(item: { image?: MediaItemImage | null; metadata?: { images?: MediaItemImage[] | null } | null; album?: ItemMapping | null } | null | undefined): MediaItemImage | undefined {
	if (!item) return undefined;
	if (item.image?.type === "thumb") return item.image;
	if (item.album?.image?.type === "thumb") return item.album.image;
	return item.metadata?.images?.find((image) => image.type === "thumb") ?? item.image ?? undefined;
}

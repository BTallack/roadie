import streamDeck from "@elgato/streamdeck";

import { NextAction } from "./actions/next";
import { NowPlayingAction } from "./actions/nowplaying";
import { PlayPauseAction } from "./actions/playpause";
import { PlaylistAction } from "./actions/playlist";
import { PreviousAction } from "./actions/previous";
import { RadioAction } from "./actions/radio";
import { StopAction } from "./actions/stop";
import { VolumeAction } from "./actions/volume";
import { loadDefaults, session, type GlobalSettings } from "./shared";

// Info, not trace: trace logs every message, and settings messages carry the token.
streamDeck.logger.setLevel("info");

for (const action of [new NowPlayingAction(), new PlayPauseAction(), new NextAction(), new PreviousAction(), new StopAction(), new VolumeAction(), new PlaylistAction(), new RadioAction()]) {
	streamDeck.actions.registerAction(action);
}

streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
	loadDefaults(ev.settings);
	session.configure(ev.settings.url, ev.settings.token);
});
streamDeck.system.onSystemDidWakeUp(() => session.wake());

await streamDeck.connect();
const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
loadDefaults(settings);
session.configure(settings.url, settings.token);

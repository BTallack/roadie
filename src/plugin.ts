import streamDeck from "@elgato/streamdeck";

import { AlbumAction } from "./actions/album";
import { ArtistRadioAction } from "./actions/artistradio";
import { FavouriteAction } from "./actions/favourite";
import { GroupAction } from "./actions/group";
import { NextAction } from "./actions/next";
import { NowPlayingAction } from "./actions/nowplaying";
import { PlayPauseAction } from "./actions/playpause";
import { PlaylistAction } from "./actions/playlist";
import { PowerAction } from "./actions/power";
import { PreviousAction } from "./actions/previous";
import { RadioAction } from "./actions/radio";
import { RepeatAction } from "./actions/repeat";
import { SelectPlayerAction } from "./actions/selectplayer";
import { ShuffleAction } from "./actions/shuffle";
import { SkipAction } from "./actions/skip";
import { StopAction } from "./actions/stop";
import { TransferAction } from "./actions/transfer";
import { VolumeAction } from "./actions/volume";
import { loadGlobal, session, type GlobalSettings } from "./shared";

// Info, not trace: trace logs every message, and settings messages carry the token.
streamDeck.logger.setLevel("info");

for (const action of [new NowPlayingAction(), new PlayPauseAction(), new NextAction(), new PreviousAction(), new StopAction(), new VolumeAction(), new PlaylistAction(), new RadioAction(), new AlbumAction(), new ArtistRadioAction(), new ShuffleAction(), new RepeatAction(), new FavouriteAction(), new GroupAction(), new TransferAction(), new SelectPlayerAction(), new PowerAction(), new SkipAction()]) {
	streamDeck.actions.registerAction(action);
}

streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
	loadGlobal(ev.settings);
	session.configure(ev.settings.url, ev.settings.token);
});
streamDeck.system.onSystemDidWakeUp(() => session.wake());

await streamDeck.connect();
const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
loadGlobal(settings);
session.configure(settings.url, settings.token);

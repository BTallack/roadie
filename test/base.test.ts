// The update queue every key goes through: repeats dropped, bursts collapsed to the latest
// image within Elgato's ten-a-second limit, and the success tick replaced afterwards.
import assert from "node:assert/strict";
import test from "node:test";

import { PlayerAction } from "../src/actions/base";
import { messageKey } from "../src/render";

class Probe extends PlayerAction {
	protected draw(): void {}
	show(action: object, image: string): void {
		this.setImage(action as never, image);
	}
	press(action: object): Promise<boolean> {
		return this.run(action as never, async () => undefined);
	}
}

function fakeKey() {
	const sent: string[] = [];
	return { sent, key: { id: "k", isKey: () => true, isDial: () => false, isInMultiAction: () => false, setImage: async (image: string) => void sent.push(image), showAlert: async () => undefined } };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const a = messageKey("A", "one");
const b = messageKey("B", "two");
const c = messageKey("C", "three");

test("drops repeats and collapses a burst into its latest image", async () => {
	const probe = new Probe();
	const { sent, key } = fakeKey();
	probe.show(key, a);
	probe.show(key, a);
	probe.show(key, b);
	probe.show(key, c);
	assert.equal(sent.length, 1, "the first goes out at once, the rest wait");
	await wait(150);
	assert.equal(sent.length, 2, "one more after 100 ms: the latest, not each in turn");
	assert.ok(sent[1].length > 0 && sent[1] !== sent[0]);
	probe.show(key, c);
	await wait(150);
	assert.equal(sent.length, 2, "the same image again isn't resent");
});

test("the success tick is replaced by the next drawing, even an unchanged one", async () => {
	const probe = new Probe();
	const { sent, key } = fakeKey();
	probe.show(key, a);
	await wait(150);
	assert.ok(await probe.press(key));
	assert.equal(sent.length, 2, "the tick goes out at once");
	assert.notEqual(sent[1], sent[0]);
	probe.show(key, a);
	await wait(150);
	assert.equal(sent.length, 3, "the key's own image comes back after the tick");
	assert.equal(sent[2], sent[0]);
});

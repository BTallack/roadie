// The server section: fields while nothing is connected (or on Change), otherwise a
// one-line summary, since the address and token are shared by every key. Also refreshes
// the player and playlist lists once the server answers, so one can be picked straight away.
(() => {
	const client = SDPIComponents.streamDeckClient;
	const $ = (id) => document.getElementById(id);
	let lastState;
	let editing = false;

	const render = (payload) => {
		const connected = payload.state === "live";
		const showFields = editing || !connected;
		$("server-fields").hidden = !showFields;
		$("server-summary").hidden = showFields;
		$("server-name").textContent = payload.server || "";
		for (const el of document.querySelectorAll(".state")) {
			el.textContent = payload.text;
			el.dataset.state = payload.state;
		}
		$("note").hidden = !showFields;
	};

	client.sendToPropertyInspector.subscribe((message) => {
		const payload = message.payload || {};
		if (payload.event !== "connection") return;
		render(payload);
		if (payload.state !== lastState && payload.state === "live") {
			editing = false;
			document.querySelectorAll("sdpi-select[datasource]").forEach((select) => select.refresh && select.refresh());
			render(payload);
		}
		lastState = payload.state;
	});

	const ask = () => client.send("sendToPlugin", { event: "getConnection" });
	client.didReceiveGlobalSettings.subscribe(() => setTimeout(ask, 600));
	document.addEventListener("DOMContentLoaded", () => {
		$("change").addEventListener("click", () => {
			editing = true;
			$("server-fields").hidden = false;
			$("server-summary").hidden = true;
			$("note").hidden = false;
		});
		ask();
		setInterval(ask, 2000);
	});
})();

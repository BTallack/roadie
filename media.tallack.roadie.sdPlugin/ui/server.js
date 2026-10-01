// The server section: fields while nothing is connected (or on Change), otherwise a
// one-line summary, since the address and token are shared by every key. Also refreshes
// the player and playlist lists once the server answers, so one can be picked straight away.
//
// "Find on my network" asks the plugin to look for Music Assistant over mDNS and lists
// what it finds; choosing one saves its address for every key. With no address set yet,
// the search runs by itself when the panel opens.
(() => {
	const client = SDPIComponents.streamDeckClient;
	const $ = (id) => document.getElementById(id);
	let lastState;
	let editing = false;
	let searched = false;

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
		if (payload.state === "unconfigured" && !searched) find(false);
	};

	const find = (fresh) => {
		searched = true;
		$("found").replaceChildren();
		$("find-state").hidden = false;
		$("find-state").textContent = "Looking for Music Assistant…";
		$("find").disabled = true;
		client.send("sendToPlugin", { event: "discover", fresh });
	};

	const showFound = (servers) => {
		$("find").disabled = false;
		const list = $("found");
		list.replaceChildren();
		if (!servers.length) {
			$("find-state").textContent = "None found. Type the address instead: Music Assistant usually uses port 8095.";
			return;
		}
		$("find-state").textContent = servers.length === 1 ? "Found one:" : `Found ${servers.length}:`;
		for (const server of servers) {
			const row = document.createElement("div");
			row.className = "found-row";
			const text = document.createElement("div");
			text.className = "text";
			const name = document.createElement("span");
			name.className = "server";
			name.textContent = server.name;
			const detail = document.createElement("span");
			detail.className = "detail";
			detail.textContent = `${server.address} · ${server.version}`;
			text.append(name, document.createElement("br"), detail);
			const use = document.createElement("sdpi-button");
			use.textContent = "Use";
			use.addEventListener("click", () => {
				client.send("sendToPlugin", { event: "useServer", url: server.url });
				$("find-state").textContent = `Using ${server.address}. Add a token below if it isn't connected yet.`;
				list.replaceChildren();
			});
			row.append(text, use);
			list.append(row);
		}
	};

	client.sendToPropertyInspector.subscribe((message) => {
		const payload = message.payload || {};
		if (payload.event === "discovered") return showFound(payload.servers || []);
		if (payload.event !== "connection") return;
		render(payload);
		if (payload.state !== lastState && payload.state === "live") {
			editing = false;
			document.querySelectorAll("sdpi-select[datasource], sdpi-checkbox-list[datasource]").forEach((select) => select.refresh && select.refresh());
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
		$("find").addEventListener("click", () => find(true));
		ask();
		setInterval(ask, 2000);
	});
})();

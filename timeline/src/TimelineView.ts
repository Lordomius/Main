import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type TimelinePlugin from "./main";
import { EVENT_COLORS, TimelineEvent } from "./types";

export const VIEW_TYPE_TIMELINE = "vertical-timeline-view";

function formatDate(iso: string): { year: string; day: string } {
	const d = new Date(iso + "T00:00:00");
	if (isNaN(d.getTime())) return { year: iso, day: "" };
	const year = d.getFullYear().toString();
	const day = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
	return { year, day };
}

export class TimelineView extends ItemView {
	plugin: TimelinePlugin;
	private expanded = new Set<string>();

	constructor(leaf: WorkspaceLeaf, plugin: TimelinePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_TIMELINE;
	}

	getDisplayText() {
		return "Timeline";
	}

	getIcon() {
		return "git-commit-vertical";
	}

	async onOpen() {
		this.render();
	}

	async onClose() {}

	render() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("vt-container");

		container.createDiv({ cls: "vt-header" }).createEl("h2", { text: "Timeline" });

		const events = [...this.plugin.getEvents()].sort((a, b) => {
			if (a.date !== b.date) return a.date < b.date ? -1 : 1;
			return a.order - b.order;
		});

		const list = container.createDiv({ cls: "vt-list" });

		if (events.length === 0) {
			list.createDiv({ cls: "vt-empty-state", text: "No events yet." });
		} else {
			events.forEach((event, index) => {
				list.appendChild(this.renderRow(event, index % 2 === 0 ? "left" : "right"));
			});
		}

		this.renderAddForm(container);
	}

	private renderRow(event: TimelineEvent, side: "left" | "right"): HTMLElement {
		const row = document.createElement("div");
		row.addClass("vt-row", side === "left" ? "vt-row-left" : "vt-row-right");

		const leftSlot = row.createDiv({ cls: "vt-side vt-side-left" });
		const node = row.createDiv({ cls: "vt-node" });
		const rightSlot = row.createDiv({ cls: "vt-side vt-side-right" });

		const square = node.createDiv({ cls: "vt-square" });
		square.style.background = event.color;

		const card = this.renderCard(event);
		(side === "left" ? leftSlot : rightSlot).appendChild(card);

		return row;
	}

	private renderCard(event: TimelineEvent): HTMLElement {
		const card = document.createElement("div");
		card.addClass("vt-card");
		card.style.setProperty("--vt-color", event.color);

		const { year, day } = formatDate(event.date);

		const header = card.createDiv({ cls: "vt-card-header" });
		header.createDiv({ cls: "vt-card-year", text: year });
		header.createDiv({ cls: "vt-card-date", text: day });

		const titleRow = card.createDiv({ cls: "vt-card-title-row" });
		const titleEl = titleRow.createEl(event.linkedPath ? "a" : "span", {
			cls: "vt-card-title",
			text: event.title || "(untitled)",
		});
		if (event.linkedPath) {
			titleEl.addClass("vt-card-title-link");
			titleEl.addEventListener("click", (evt) => {
				evt.stopPropagation();
				this.openLinkedFile(event.linkedPath as string);
			});
		}

		const actions = titleRow.createDiv({ cls: "vt-card-actions" });
		const editBtn = actions.createSpan({ cls: "vt-card-action", text: "✎" });
		editBtn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			this.editEventInline(card, event);
		});
		const deleteBtn = actions.createSpan({ cls: "vt-card-action", text: "🗑" });
		let confirming = false;
		let confirmTimeout: number | undefined;
		deleteBtn.addEventListener("click", async (evt) => {
			evt.stopPropagation();
			if (!confirming) {
				confirming = true;
				deleteBtn.setText("Confirm");
				confirmTimeout = window.setTimeout(() => {
					confirming = false;
					deleteBtn.setText("🗑");
				}, 2500);
				return;
			}
			window.clearTimeout(confirmTimeout);
			await this.plugin.deleteEvent(event.id);
			this.render();
		});

		if (event.description) {
			const isOpen = this.expanded.has(event.id);
			const desc = card.createDiv({ cls: "vt-card-description" });
			desc.setText(event.description);
			desc.toggleClass("vt-collapsed", !isOpen);

			card.addEventListener("click", () => {
				if (this.expanded.has(event.id)) this.expanded.delete(event.id);
				else this.expanded.add(event.id);
				desc.toggleClass("vt-collapsed", !this.expanded.has(event.id));
			});
		}

		return card;
	}

	private openLinkedFile(path: string) {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			this.app.workspace.getLeaf(false).openFile(file);
		}
	}

	private editEventInline(card: HTMLElement, event: TimelineEvent) {
		card.empty();
		card.addClass("vt-card-editing");

		const dateInput = card.createEl("input", { type: "date" });
		dateInput.value = event.date;

		const titleInput = card.createEl("input", { type: "text", placeholder: "Title" });
		titleInput.value = event.title;

		const descInput = card.createEl("textarea", { placeholder: "Description" });
		descInput.value = event.description;

		const linkInput = card.createEl("input", {
			type: "text",
			placeholder: "Linked note path (optional)",
		});
		linkInput.value = event.linkedPath ?? "";
		this.attachFileSuggestions(linkInput);

		const colorRow = card.createDiv({ cls: "vt-edit-colors" });
		let selectedColor = event.color;
		for (const c of EVENT_COLORS) {
			const swatch = colorRow.createSpan({ cls: "vt-color-swatch" });
			swatch.style.background = c;
			if (c === event.color) swatch.addClass("vt-color-swatch-selected");
			swatch.addEventListener("click", (evt) => {
				evt.stopPropagation();
				colorRow
					.querySelectorAll(".vt-color-swatch-selected")
					.forEach((el) => el.removeClass("vt-color-swatch-selected"));
				swatch.addClass("vt-color-swatch-selected");
				selectedColor = c;
			});
		}

		const actions = card.createDiv({ cls: "vt-edit-actions" });
		const saveBtn = actions.createEl("button", { text: "Save", cls: "mod-cta" });
		saveBtn.addEventListener("click", async (evt) => {
			evt.stopPropagation();
			await this.plugin.updateEvent(event.id, {
				date: dateInput.value || event.date,
				title: titleInput.value.trim() || "(untitled)",
				description: descInput.value,
				linkedPath: linkInput.value.trim() || undefined,
				color: selectedColor,
			});
			this.render();
		});
		const cancelBtn = actions.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			this.render();
		});
	}

	private attachFileSuggestions(input: HTMLInputElement) {
		const listId = "vt-file-suggestions";
		let datalist = document.getElementById(listId) as HTMLDataListElement | null;
		if (!datalist) {
			datalist = document.createElement("datalist");
			datalist.id = listId;
			document.body.appendChild(datalist);
		}
		datalist.empty();
		for (const file of this.app.vault.getMarkdownFiles()) {
			datalist.createEl("option", { value: file.path });
		}
		input.setAttr("list", listId);
	}

	private renderAddForm(container: HTMLElement) {
		const wrap = container.createDiv({ cls: "vt-add-wrap" });
		const addBtn = wrap.createEl("button", { cls: "vt-add-btn", text: "+ Add event" });
		addBtn.addEventListener("click", () => {
			wrap.empty();

			const form = wrap.createDiv({ cls: "vt-add-form" });

			const dateInput = form.createEl("input", { type: "date" });
			dateInput.value = new Date().toISOString().slice(0, 10);

			const titleInput = form.createEl("input", { type: "text", placeholder: "Title" });
			const descInput = form.createEl("textarea", { placeholder: "Description" });

			const linkInput = form.createEl("input", {
				type: "text",
				placeholder: "Linked note path (optional)",
			});
			this.attachFileSuggestions(linkInput);

			const colorRow = form.createDiv({ cls: "vt-edit-colors" });
			let selectedColor = EVENT_COLORS[this.plugin.getEvents().length % EVENT_COLORS.length];
			for (const c of EVENT_COLORS) {
				const swatch = colorRow.createSpan({ cls: "vt-color-swatch" });
				swatch.style.background = c;
				if (c === selectedColor) swatch.addClass("vt-color-swatch-selected");
				swatch.addEventListener("click", () => {
					colorRow
						.querySelectorAll(".vt-color-swatch-selected")
						.forEach((el) => el.removeClass("vt-color-swatch-selected"));
					swatch.addClass("vt-color-swatch-selected");
					selectedColor = c;
				});
			}

			const actions = form.createDiv({ cls: "vt-edit-actions" });
			const saveBtn = actions.createEl("button", { text: "Add", cls: "mod-cta" });
			saveBtn.addEventListener("click", async () => {
				if (!titleInput.value.trim() || !dateInput.value) return;
				await this.plugin.addEvent({
					date: dateInput.value,
					title: titleInput.value.trim(),
					description: descInput.value,
					linkedPath: linkInput.value.trim() || undefined,
					color: selectedColor,
				});
				this.render();
			});
			const cancelBtn = actions.createEl("button", { text: "Cancel" });
			cancelBtn.addEventListener("click", () => this.render());
		});
	}
}

import { Plugin, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import { TimelineView, VIEW_TYPE_TIMELINE } from "./TimelineView";
import { DEFAULT_DATA, TimelineData, TimelineEvent } from "./types";

function makeId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default class TimelinePlugin extends Plugin {
	data: TimelineData = DEFAULT_DATA;

	async onload() {
		await this.loadPluginData();

		this.registerView(VIEW_TYPE_TIMELINE, (leaf) => new TimelineView(leaf, this));

		this.addRibbonIcon("git-commit-vertical", "Open timeline", () => this.activateView());

		this.addCommand({
			id: "open-timeline",
			name: "Open timeline",
			callback: () => this.activateView(),
		});

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => this.handleRename(file, oldPath))
		);
		this.registerEvent(this.app.vault.on("delete", (file) => this.handleDelete(file)));
	}

	onunload() {}

	async activateView() {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_TIMELINE);
		let leaf: WorkspaceLeaf;
		if (existing.length > 0) {
			leaf = existing[0];
		} else {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({ type: VIEW_TYPE_TIMELINE, active: true });
		}
		workspace.revealLeaf(leaf);
	}

	async loadPluginData() {
		const loaded = (await this.loadData()) as Partial<TimelineData> | null;
		this.data = { events: loaded?.events ?? [] };
	}

	async savePluginData() {
		await this.saveData(this.data);
	}

	getEvents(): TimelineEvent[] {
		return this.data.events;
	}

	async addEvent(input: {
		date: string;
		title: string;
		description: string;
		linkedPath?: string;
		color: string;
	}): Promise<TimelineEvent> {
		const event: TimelineEvent = {
			...input,
			id: makeId(),
			order: this.data.events.length,
		};
		this.data.events.push(event);
		await this.savePluginData();
		return event;
	}

	async updateEvent(id: string, patch: Partial<TimelineEvent>) {
		const event = this.data.events.find((e) => e.id === id);
		if (!event) return;
		Object.assign(event, patch);
		await this.savePluginData();
	}

	async deleteEvent(id: string) {
		this.data.events = this.data.events.filter((e) => e.id !== id);
		await this.savePluginData();
	}

	refreshViews() {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMELINE)) {
			const view = leaf.view;
			if (view instanceof TimelineView) view.render();
		}
	}

	private async handleRename(file: TAbstractFile, oldPath: string) {
		if (!(file instanceof TFile)) return;
		let changed = false;
		for (const event of this.data.events) {
			if (event.linkedPath === oldPath) {
				event.linkedPath = file.path;
				changed = true;
			}
		}
		if (changed) {
			await this.savePluginData();
			this.refreshViews();
		}
	}

	private async handleDelete(file: TAbstractFile) {
		if (!(file instanceof TFile)) return;
		let changed = false;
		for (const event of this.data.events) {
			if (event.linkedPath === file.path) {
				event.linkedPath = undefined;
				changed = true;
			}
		}
		if (changed) {
			await this.savePluginData();
			this.refreshViews();
		}
	}
}

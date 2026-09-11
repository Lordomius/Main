import { Plugin, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import { TaskPanelView, VIEW_TYPE_TASK_PANEL } from "./TaskPanelView";
import { CATEGORY_COLORS, Category, DEFAULT_DATA, PluginData, TaskItem } from "./types";

function makeId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default class TaskPanelPlugin extends Plugin {
	data: PluginData = DEFAULT_DATA;

	async onload() {
		await this.loadPluginData();

		this.registerView(VIEW_TYPE_TASK_PANEL, (leaf) => new TaskPanelView(leaf, this));

		this.addRibbonIcon("check-square", "Open task panel", () => {
			this.activateView();
		});

		this.addCommand({
			id: "open-task-panel",
			name: "Open task panel",
			callback: () => this.activateView(),
		});

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => this.refreshViews())
		);
		this.registerEvent(this.app.workspace.on("file-open", () => this.refreshViews()));
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => this.handleRename(file, oldPath))
		);
		this.registerEvent(this.app.vault.on("delete", (file) => this.handleDelete(file)));
	}

	onunload() {}

	async activateView() {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_TASK_PANEL);
		let leaf: WorkspaceLeaf | null;
		if (existing.length > 0) {
			leaf = existing[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) await leaf.setViewState({ type: VIEW_TYPE_TASK_PANEL, active: true });
		}
		if (leaf) workspace.revealLeaf(leaf);
	}

	refreshViews() {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TASK_PANEL)) {
			const view = leaf.view;
			if (view instanceof TaskPanelView) view.refresh();
		}
	}

	async loadPluginData() {
		const loaded = (await this.loadData()) as Partial<PluginData> | null;
		this.data = {
			tasks: loaded?.tasks ?? {},
			categories: loaded?.categories ?? {},
		};
	}

	async savePluginData() {
		await this.saveData(this.data);
	}

	getTasks(path: string): TaskItem[] {
		return this.data.tasks[path] ?? [];
	}

	getCategories(path: string): Category[] {
		return this.data.categories[path] ?? [];
	}

	async addTask(path: string, title: string): Promise<TaskItem> {
		const list = this.data.tasks[path] ?? (this.data.tasks[path] = []);
		const task: TaskItem = {
			id: makeId(),
			title,
			text: "",
			done: false,
			categories: [],
			color: CATEGORY_COLORS[list.length % CATEGORY_COLORS.length],
			order: list.length,
		};
		list.push(task);
		await this.savePluginData();
		return task;
	}

	async updateTask(path: string, id: string, patch: Partial<TaskItem>) {
		const list = this.data.tasks[path];
		const task = list?.find((t) => t.id === id);
		if (!task) return;
		Object.assign(task, patch);
		await this.savePluginData();
	}

	async deleteTask(path: string, id: string) {
		const list = this.data.tasks[path];
		if (!list) return;
		this.data.tasks[path] = list.filter((t) => t.id !== id);
		await this.savePluginData();
	}

	async reorderTasks(path: string, orderedIds: string[]) {
		const list = this.data.tasks[path];
		if (!list) return;
		orderedIds.forEach((id, index) => {
			const task = list.find((t) => t.id === id);
			if (task) task.order = index;
		});
		await this.savePluginData();
	}

	async addCategory(path: string, name: string, color: string): Promise<Category> {
		const list = this.data.categories[path] ?? (this.data.categories[path] = []);
		const existing = list.find((c) => c.name.toLowerCase() === name.toLowerCase());
		if (existing) return existing;
		const category: Category = { name, color };
		list.push(category);
		await this.savePluginData();
		return category;
	}

	async deleteCategory(path: string, name: string) {
		const list = this.data.categories[path];
		if (list) this.data.categories[path] = list.filter((c) => c.name !== name);
		const tasks = this.data.tasks[path];
		if (tasks) {
			for (const task of tasks) task.categories = task.categories.filter((c) => c !== name);
		}
		await this.savePluginData();
	}

	private async handleRename(file: TAbstractFile, oldPath: string) {
		if (!(file instanceof TFile)) return;
		let changed = false;
		if (this.data.tasks[oldPath]) {
			this.data.tasks[file.path] = this.data.tasks[oldPath];
			delete this.data.tasks[oldPath];
			changed = true;
		}
		if (this.data.categories[oldPath]) {
			this.data.categories[file.path] = this.data.categories[oldPath];
			delete this.data.categories[oldPath];
			changed = true;
		}
		if (changed) await this.savePluginData();
		this.refreshViews();
	}

	private async handleDelete(file: TAbstractFile) {
		if (!(file instanceof TFile)) return;
		let changed = false;
		if (this.data.tasks[file.path]) {
			delete this.data.tasks[file.path];
			changed = true;
		}
		if (this.data.categories[file.path]) {
			delete this.data.categories[file.path];
			changed = true;
		}
		if (changed) await this.savePluginData();
		this.refreshViews();
	}
}

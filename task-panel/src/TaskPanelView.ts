import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type TaskPanelPlugin from "./main";
import { CATEGORY_COLORS, TaskItem } from "./types";

export const VIEW_TYPE_TASK_PANEL = "task-panel-view";

export class TaskPanelView extends ItemView {
	plugin: TaskPanelPlugin;
	file: TFile | null = null;
	private dragSourceId: string | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TaskPanelPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_TASK_PANEL;
	}

	getDisplayText() {
		return "Task panel";
	}

	getIcon() {
		return "check-square";
	}

	async onOpen() {
		this.file = this.app.workspace.getActiveFile();
		this.render();
	}

	async onClose() {}

	refresh() {
		this.file = this.app.workspace.getActiveFile();
		this.render();
	}

	private render() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("task-panel-container");

		if (!this.file || this.file.extension !== "md") {
			container.createDiv({
				cls: "task-panel-empty-state",
				text: this.file ? "No tasks for this file type." : "No note open.",
			});
			return;
		}

		const path = this.file.path;

		container.createEl("div", { cls: "task-panel-header" }).createEl("h4", {
			text: this.file.basename,
		});

		const listEl = container.createDiv({ cls: "task-panel-list" });
		this.renderTaskList(listEl, path);
		this.renderAddTask(container, path);
	}

	private renderTaskList(listEl: HTMLElement, path: string) {
		listEl.empty();
		const tasks = this.plugin.getTasks(path);
		const active = tasks.filter((t) => !t.done).sort((a, b) => a.order - b.order);
		const done = tasks.filter((t) => t.done).sort((a, b) => a.order - b.order);

		if (active.length === 0 && done.length === 0) {
			listEl.createDiv({ cls: "task-panel-empty-state", text: "No tasks yet." });
			return;
		}

		for (const task of active) listEl.appendChild(this.renderTaskCard(task, path));

		if (done.length > 0) {
			listEl.createDiv({ cls: "task-panel-done-separator", text: "Completed" });
			for (const task of done) listEl.appendChild(this.renderTaskCard(task, path));
		}
	}

	private renderTaskCard(task: TaskItem, path: string): HTMLElement {
		const card = document.createElement("div");
		card.addClass("task-card");
		if (task.done) card.addClass("task-card-done");
		card.style.borderColor = task.color;
		card.setAttr("draggable", "true");

		card.addEventListener("dragstart", () => {
			this.dragSourceId = task.id;
			card.addClass("task-card-dragging");
		});
		card.addEventListener("dragend", () => {
			card.removeClass("task-card-dragging");
			this.dragSourceId = null;
		});
		card.addEventListener("dragover", (evt) => {
			evt.preventDefault();
			card.addClass("task-card-dragover");
		});
		card.addEventListener("dragleave", () => card.removeClass("task-card-dragover"));
		card.addEventListener("drop", async (evt) => {
			evt.preventDefault();
			card.removeClass("task-card-dragover");
			const sourceId = this.dragSourceId;
			if (!sourceId || sourceId === task.id) return;
			await this.reorderAfterDrop(path, sourceId, task.id);
		});

		const topRow = card.createDiv({ cls: "task-card-top" });

		const dragHandle = topRow.createSpan({ cls: "task-card-drag-handle", text: "⠿" });
		dragHandle.setAttr("aria-hidden", "true");

		const checkbox = topRow.createEl("input", { type: "checkbox" });
		checkbox.checked = task.done;
		checkbox.addEventListener("change", async () => {
			await this.plugin.updateTask(path, task.id, { done: checkbox.checked });
			this.render();
		});

		const titleEl = topRow.createSpan({
			cls: "task-card-title",
			text: task.title || "(untitled)",
		});
		titleEl.addEventListener("click", () => this.editTaskInline(card, task, path));

		const deleteBtn = topRow.createSpan({ cls: "task-card-delete", text: "🗑" });
		let confirming = false;
		let confirmTimeout: number | undefined;
		deleteBtn.addEventListener("click", async (evt) => {
			evt.stopPropagation();
			if (!confirming) {
				confirming = true;
				deleteBtn.setText("Confirm");
				deleteBtn.addClass("task-card-delete-confirm");
				confirmTimeout = window.setTimeout(() => {
					confirming = false;
					deleteBtn.setText("🗑");
					deleteBtn.removeClass("task-card-delete-confirm");
				}, 2500);
				return;
			}
			window.clearTimeout(confirmTimeout);
			await this.plugin.deleteTask(path, task.id);
			this.render();
		});

		if (task.categories.length > 0) {
			const catRow = card.createDiv({ cls: "task-card-categories" });
			const allCats = this.plugin.getCategories(path);
			for (const catName of task.categories) {
				const cat = allCats.find((c) => c.name === catName);
				const tag = catRow.createSpan({ cls: "task-category-tag", text: catName });
				if (cat) tag.style.backgroundColor = cat.color;
			}
		}

		if (task.text) {
			const textEl = card.createDiv({ cls: "task-card-text", text: task.text });
			textEl.addEventListener("click", () => this.editTaskInline(card, task, path));
		}

		return card;
	}

	private async reorderAfterDrop(path: string, sourceId: string, targetId: string) {
		const tasks = this.plugin.getTasks(path);
		const source = tasks.find((t) => t.id === sourceId);
		if (!source) return;
		const group = tasks.filter((t) => t.done === source.done).sort((a, b) => a.order - b.order);
		const fromIdx = group.findIndex((t) => t.id === sourceId);
		const toIdx = group.findIndex((t) => t.id === targetId);
		if (fromIdx === -1 || toIdx === -1) return;
		const [moved] = group.splice(fromIdx, 1);
		group.splice(toIdx, 0, moved);
		await this.plugin.reorderTasks(path, group.map((t) => t.id));
		this.render();
	}

	private editTaskInline(card: HTMLElement, task: TaskItem, path: string) {
		card.empty();
		card.addClass("task-card-editing");

		const titleInput = card.createEl("input", {
			cls: "task-edit-title",
			type: "text",
			value: task.title,
		});

		const textInput = card.createEl("textarea", { cls: "task-edit-text" });
		textInput.value = task.text;

		const colorRow = card.createDiv({ cls: "task-edit-colors" });
		let selectedColor = task.color;
		for (const c of CATEGORY_COLORS) {
			const swatch = colorRow.createSpan({ cls: "task-color-swatch" });
			swatch.style.backgroundColor = c;
			if (c === task.color) swatch.addClass("task-color-swatch-selected");
			swatch.addEventListener("click", () => {
				colorRow
					.querySelectorAll(".task-color-swatch-selected")
					.forEach((el) => el.removeClass("task-color-swatch-selected"));
				swatch.addClass("task-color-swatch-selected");
				selectedColor = c;
			});
		}

		const catRow = card.createDiv({ cls: "task-edit-categories" });
		const selected = new Set(task.categories);

		const renderCats = () => {
			catRow.empty();
			const allCats = this.plugin.getCategories(path);
			for (const cat of allCats) {
				const chip = catRow.createSpan({ cls: "task-category-chip", text: cat.name });
				chip.style.borderColor = cat.color;
				if (selected.has(cat.name)) chip.addClass("task-category-chip-selected");
				chip.addEventListener("click", () => {
					if (selected.has(cat.name)) selected.delete(cat.name);
					else selected.add(cat.name);
					renderCats();
				});
			}
			const addInput = catRow.createEl("input", {
				cls: "task-category-add-input",
				type: "text",
				placeholder: "+ category",
			});
			addInput.addEventListener("keydown", async (evt) => {
				if (evt.key !== "Enter") return;
				const name = addInput.value.trim();
				if (!name) return;
				const color = CATEGORY_COLORS[allCats.length % CATEGORY_COLORS.length];
				const cat = await this.plugin.addCategory(path, name, color);
				selected.add(cat.name);
				renderCats();
			});
		};
		renderCats();

		const actions = card.createDiv({ cls: "task-edit-actions" });
		const saveBtn = actions.createEl("button", { text: "Save", cls: "mod-cta" });
		saveBtn.addEventListener("click", async () => {
			await this.plugin.updateTask(path, task.id, {
				title: titleInput.value.trim() || "(untitled)",
				text: textInput.value,
				color: selectedColor,
				categories: Array.from(selected),
			});
			this.render();
		});
		const cancelBtn = actions.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.render());
	}

	private renderAddTask(container: HTMLElement, path: string) {
		const wrap = container.createDiv({ cls: "task-add-wrap" });
		const addBtn = wrap.createEl("button", { cls: "task-add-btn", text: "+ Add task" });
		addBtn.addEventListener("click", () => {
			wrap.empty();
			const input = wrap.createEl("input", {
				cls: "task-add-input",
				type: "text",
				placeholder: "Task title…",
			});
			input.focus();
			let settled = false;
			const commit = async () => {
				if (settled) return;
				settled = true;
				const title = input.value.trim();
				if (title) await this.plugin.addTask(path, title);
				this.render();
			};
			input.addEventListener("keydown", (evt) => {
				if (evt.key === "Enter") commit();
				if (evt.key === "Escape") {
					settled = true;
					this.render();
				}
			});
			input.addEventListener("blur", commit);
		});
	}
}

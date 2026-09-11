export interface TaskItem {
	id: string;
	title: string;
	text: string;
	done: boolean;
	categories: string[];
	color: string;
	order: number;
}

export interface Category {
	name: string;
	color: string;
}

export interface PluginData {
	tasks: Record<string, TaskItem[]>;
	categories: Record<string, Category[]>;
}

export const DEFAULT_DATA: PluginData = {
	tasks: {},
	categories: {},
};

export const CATEGORY_COLORS = [
	"#e06c75",
	"#e5c07b",
	"#98c379",
	"#56b6c2",
	"#61afef",
	"#c678dd",
	"#abb2bf",
	"#d19a66",
];

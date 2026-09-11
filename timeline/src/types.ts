export interface TimelineEvent {
	id: string;
	date: string; // "YYYY-MM-DD"
	title: string;
	description: string;
	linkedPath?: string;
	color: string;
	order: number;
}

export interface TimelineData {
	events: TimelineEvent[];
}

export const DEFAULT_DATA: TimelineData = { events: [] };

export const EVENT_COLORS = [
	"#e06c75",
	"#e5c07b",
	"#98c379",
	"#56b6c2",
	"#61afef",
	"#c678dd",
	"#abb2bf",
	"#d19a66",
];

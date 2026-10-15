// Metrics read helpers for the panel UI. Samples are written by the worker
// every METRICS_MS (~15s) into metrics_samples.
import { desc, asc } from 'drizzle-orm';
import { db } from './db/index.js';
import { metricsSamples } from './db/schema.js';

export interface ContainerSample {
	name?: string;
	site?: string | null;
	cpuPct?: number;
	memBytes?: number;
	memLimit?: number;
	rxBytes?: number;
	txBytes?: number;
}

export interface MetricsPayload {
	host?: {
		cpuPct?: number;
		memTotal?: number;
		memAvailable?: number;
		load1?: number;
		load5?: number;
		load15?: number;
		diskTotal?: number;
		diskFree?: number;
	};
	containers?: ContainerSample[];
}

export interface MetricsRow {
	ts: number;
	payload: MetricsPayload;
}

function parse(row: { ts: Date; payload: string }): MetricsRow {
	try {
		return { ts: row.ts.getTime(), payload: JSON.parse(row.payload) as MetricsPayload };
	} catch {
		return { ts: row.ts.getTime(), payload: {} };
	}
}

/** Newest metrics sample, or null before the worker's first pass. */
export async function latestMetrics(): Promise<MetricsRow | null> {
	const rows = await db.select().from(metricsSamples).orderBy(desc(metricsSamples.ts)).limit(1);
	return rows[0] ? parse(rows[0]) : null;
}

/** Recent samples oldest→newest for charting. */
export async function metricsHistory(limit = 240): Promise<MetricsRow[]> {
	const rows = await db
		.select()
		.from(metricsSamples)
		.orderBy(desc(metricsSamples.ts))
		.limit(limit);
	return rows.reverse().map(parse);
}

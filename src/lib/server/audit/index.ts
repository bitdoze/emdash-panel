// Audit trail for sensitive panel operations. Never log secret values here.
import { db } from '../db/index.js';
import { auditEvents } from '../db/schema.js';

export interface AuditInput {
	actorId?: string | null;
	action: string;
	targetType?: string;
	targetId?: string;
	metadata?: Record<string, unknown>;
	ip?: string;
}

export async function recordAudit(input: AuditInput): Promise<void> {
	await db.insert(auditEvents).values({
		actorId: input.actorId ?? null,
		action: input.action,
		targetType: input.targetType ?? null,
		targetId: input.targetId ?? null,
		metadata: input.metadata ? JSON.stringify(input.metadata).slice(0, 4000) : null,
		ip: input.ip ?? null
	});
}

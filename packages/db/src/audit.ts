import type { Database } from "./client";
import { auditEvents } from "./schema";
import type { SchoolScope } from "./tenant";

export interface AuditEvent {
  actorUserId: string | null;
  /** Dotted verb, e.g. `fees.payment_reversed`. */
  action: string;
  entityType?: string;
  entityId?: string;
  /** Context only. Never passwords, tokens or children's personal data. */
  metadata?: Record<string, unknown>;
}

/** Records a school-level audit event inside the same transaction as the change it describes. */
export async function recordSchoolAudit(scope: SchoolScope, event: AuditEvent) {
  await scope.tx.insert(auditEvents).values({ ...event, schoolId: scope.schoolId });
}

/** Records a platform-level audit event (no school), e.g. a school being suspended. */
export async function recordPlatformAudit(db: Database, event: AuditEvent) {
  await db.insert(auditEvents).values({ ...event, schoolId: null });
}

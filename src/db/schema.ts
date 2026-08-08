import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const paymentStatus = pgEnum("payment_status", [
  "CREATED",
  "RISK_REVIEW",
  "CUSTOMER_INTERVENTION",
  "AUTHORISED",
  "SETTLED",
  "CANCELLED",
  "REJECTED",
]);

export const paymentRiskDecision = pgEnum("payment_risk_decision", [
  "ALLOW",
  "INTERVENE",
]);

export const paymentRiskReason = pgEnum("payment_risk_reason", [
  "NEW_PAYEE",
  "AMOUNT_OUTLIER",
  "INVESTMENT_SCAM_LANGUAGE",
]);

export const paymentInterventionStatus = pgEnum(
  "payment_intervention_status",
  ["PENDING", "CANCELLED", "CONTINUED"],
);

export const fraudCaseStatus = pgEnum("fraud_case_status", ["DRAFT", "SUBMITTED"]);
export const scamCategory = pgEnum("scam_category", ["INVESTMENT", "PURCHASE", "IMPERSONATION", "ROMANCE", "INVOICE_REDIRECTION", "OTHER", "UNSURE"]);
export const contactChannel = pgEnum("contact_channel", ["PHONE", "SMS", "MESSAGING_APP", "EMAIL", "SOCIAL_MEDIA", "WEBSITE", "IN_PERSON", "OTHER"]);
export const reportIndicator = pgEnum("report_indicator", ["YES", "NO", "UNSURE"]);
export const evidenceKind = pgEnum("evidence_kind", ["FILE", "PASTED_TEXT", "CALL_NOTE"]);
export const evidenceCategory = pgEnum("evidence_category", ["MESSAGE_CONVERSATION", "EMAIL", "MARKETPLACE_CONVERSATION", "INVESTMENT_ADVERTISEMENT", "INVOICE_OR_QUOTE", "PAYMENT_INSTRUCTION", "RECEIPT_OR_CONFIRMATION", "CALL_NOTE", "ORGANISATION_DETAILS", "OTHER_DOCUMENT"]);
export const evidenceStatus = pgEnum("evidence_status", ["AWAITING_UPLOAD", "VALIDATING", "READY", "REJECTED", "REMOVED"]);
export const extractionStatus = pgEnum("extraction_status", ["PENDING", "PROCESSING", "COMPLETED", "FAILED"]);
export const extractionReviewStatus = pgEnum("extraction_review_status", ["CONFIRMED", "CORRECTED"]);
export const caseEventActor = pgEnum("case_event_actor", ["CUSTOMER", "SYSTEM"]);

export const customers = pgTable("customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  ...timestamps,
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    accountName: text("account_name").notNull(),
    currencyCode: text("currency_code").notNull(),
    openingBalanceMinor: integer("opening_balance_minor").notNull(),
    ...timestamps,
  },
  (table) => [
    index("accounts_customer_id_idx").on(table.customerId),
    check(
      "accounts_currency_code_length_check",
      sql`char_length(${table.currencyCode}) = 3`,
    ),
    check(
      "accounts_opening_balance_non_negative_check",
      sql`${table.openingBalanceMinor} >= 0`,
    ),
  ],
);

export const beneficiaries = pgTable(
  "beneficiaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    displayName: text("display_name").notNull(),
    maskedAccountNumber: text("masked_account_number").notNull(),
    maskedSortCode: text("masked_sort_code").notNull(),
    ...timestamps,
  },
  (table) => [index("beneficiaries_customer_id_idx").on(table.customerId)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    beneficiaryId: uuid("beneficiary_id")
      .notNull()
      .references(() => beneficiaries.id),
    amountMinor: integer("amount_minor").notNull(),
    currencyCode: text("currency_code").notNull(),
    reference: text("reference").notNull(),
    status: paymentStatus("status").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    ...timestamps,
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("payments_account_id_created_at_idx").on(
      table.accountId,
      table.createdAt,
    ),
    uniqueIndex("payments_idempotency_key_idx").on(table.idempotencyKey),
    check(
      "payments_amount_positive_check",
      sql`${table.amountMinor} > 0`,
    ),
    check(
      "payments_currency_code_length_check",
      sql`char_length(${table.currencyCode}) = 3`,
    ),
  ],
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    eventType: text("event_type").notNull(),
    fromStatus: paymentStatus("from_status"),
    toStatus: paymentStatus("to_status").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("payment_events_payment_id_occurred_at_idx").on(
      table.paymentId,
      table.occurredAt,
    ),
  ],
);

export const paymentRiskAssessments = pgTable(
  "payment_risk_assessments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    decision: paymentRiskDecision("decision").notNull(),
    score: integer("score").notNull(),
    reasonCodes: paymentRiskReason("reason_codes").array().notNull(),
    facts: jsonb("facts")
      .$type<{
        previousSettledPaymentCount: number;
        previousSettledPaymentCountToBeneficiary: number;
        medianSettledAmountMinor: number | null;
        amountOutlierThresholdMinor: number;
        matchedInvestmentTerms: string[];
      }>()
      .notNull(),
    ruleVersion: text("rule_version").notNull(),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("payment_risk_assessments_payment_id_idx").on(table.paymentId),
    check(
      "payment_risk_assessments_score_range_check",
      sql`${table.score} between 0 and 100`,
    ),
    check(
      "payment_risk_assessments_rule_version_not_blank_check",
      sql`char_length(btrim(${table.ruleVersion})) > 0`,
    ),
    check(
      "payment_risk_assessments_facts_object_check",
      sql`jsonb_typeof(${table.facts}) = 'object'`,
    ),
    check(
      "payment_risk_assessments_decision_score_check",
      sql`(${table.decision} = 'ALLOW' and ${table.score} < 50) or (${table.decision} = 'INTERVENE' and ${table.score} >= 50)`,
    ),
  ],
);

export const paymentInterventions = pgTable(
  "payment_interventions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    status: paymentInterventionStatus("status").notNull(),
    copyVersion: text("copy_version").notNull(),
    acknowledgementConfirmed: boolean("acknowledgement_confirmed")
      .default(false)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("payment_interventions_payment_id_idx").on(table.paymentId),
    check(
      "payment_interventions_copy_version_not_blank_check",
      sql`char_length(btrim(${table.copyVersion})) > 0`,
    ),
    check(
      "payment_interventions_lifecycle_check",
      sql`(${table.status} = 'PENDING' and ${table.resolvedAt} is null and ${table.acknowledgementConfirmed} = false) or (${table.status} = 'CANCELLED' and ${table.resolvedAt} is not null and ${table.acknowledgementConfirmed} = false) or (${table.status} = 'CONTINUED' and ${table.resolvedAt} is not null and ${table.acknowledgementConfirmed} = true)`,
    ),
  ],
);

export const fraudCases = pgTable("fraud_cases", {
  id: uuid("id").primaryKey(),
  paymentId: uuid("payment_id").notNull().references(() => payments.id),
  caseReference: text("case_reference").notNull(),
  status: fraudCaseStatus("status").default("DRAFT").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  submissionIdempotencyKey: uuid("submission_idempotency_key"),
}, (table) => [
  uniqueIndex("fraud_cases_payment_id_idx").on(table.paymentId),
  uniqueIndex("fraud_cases_case_reference_idx").on(table.caseReference),
  uniqueIndex("fraud_cases_submission_idempotency_key_idx").on(table.submissionIdempotencyKey).where(sql`${table.submissionIdempotencyKey} is not null`),
  check("fraud_cases_reference_format_check", sql`${table.caseReference} ~ '^SP-[A-F0-9]{12}$'`),
  check("fraud_cases_lifecycle_check", sql`(${table.status} = 'DRAFT' and ${table.submittedAt} is null) or (${table.status} = 'SUBMITTED' and ${table.submittedAt} is not null)`),
]);

export const fraudCaseReports = pgTable("fraud_case_reports", {
  caseId: uuid("case_id").primaryKey().references(() => fraudCases.id),
  suspectedScamCategory: scamCategory("suspected_scam_category"),
  believedPaymentPurpose: text("believed_payment_purpose"),
  contactChannel: contactChannel("contact_channel"),
  firstContactAt: timestamp("first_contact_at", { withTimezone: true }),
  discoveredAt: timestamp("discovered_at", { withTimezone: true }),
  discoveryReason: text("discovery_reason"),
  narrative: text("narrative"),
  pressureOrUrgency: reportIndicator("pressure_or_urgency"),
  guaranteedReturns: reportIndicator("guaranteed_returns"),
  toldToIgnoreWarnings: reportIndicator("told_to_ignore_warnings"),
  remoteAccessRequested: reportIndicator("remote_access_requested"),
  impersonatedOrganisation: text("impersonated_organisation"),
  additionalSupportRequested: boolean("additional_support_requested"),
  version: integer("version").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
  check("fraud_case_reports_version_positive_check", sql`${table.version} > 0`),
  check("fraud_case_reports_purpose_length_check", sql`${table.believedPaymentPurpose} is null or char_length(${table.believedPaymentPurpose}) between 1 and 200`),
  check("fraud_case_reports_discovery_reason_length_check", sql`${table.discoveryReason} is null or char_length(${table.discoveryReason}) between 1 and 500`),
  check("fraud_case_reports_narrative_length_check", sql`${table.narrative} is null or char_length(${table.narrative}) between 20 and 4000`),
  check("fraud_case_reports_organisation_length_check", sql`${table.impersonatedOrganisation} is null or char_length(${table.impersonatedOrganisation}) between 1 and 200`),
]);

export const evidenceItems = pgTable("evidence_items", {
  id: uuid("id").primaryKey(),
  caseId: uuid("case_id").notNull().references(() => fraudCases.id),
  kind: evidenceKind("kind").notNull(),
  category: evidenceCategory("category").notNull(),
  status: evidenceStatus("status").notNull(),
  originalFilename: text("original_filename"),
  storageObjectKey: text("storage_object_key"),
  declaredMimeType: text("declared_mime_type"),
  detectedMimeType: text("detected_mime_type"),
  sizeBytes: integer("size_bytes"),
  sha256: text("sha256"),
  inlineText: text("inline_text"),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  creationIdempotencyKey: uuid("creation_idempotency_key"),
  uploadIdempotencyKey: uuid("upload_idempotency_key"),
  uploadExpiresAt: timestamp("upload_expires_at", { withTimezone: true }),
  validationStartedAt: timestamp("validation_started_at", { withTimezone: true }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  safeFailureCode: text("safe_failure_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("evidence_items_storage_object_key_idx").on(table.storageObjectKey).where(sql`${table.storageObjectKey} is not null`),
  uniqueIndex("evidence_items_creation_idempotency_key_idx").on(table.creationIdempotencyKey).where(sql`${table.creationIdempotencyKey} is not null`),
  uniqueIndex("evidence_items_upload_idempotency_key_idx").on(table.uploadIdempotencyKey).where(sql`${table.uploadIdempotencyKey} is not null`),
  index("evidence_items_case_id_created_at_idx").on(table.caseId, table.createdAt, table.id),
  check("evidence_items_filename_check", sql`${table.originalFilename} is null or (char_length(btrim(${table.originalFilename})) > 0 and char_length(${table.originalFilename}) <= 255)`),
  check("evidence_items_sha256_check", sql`${table.sha256} is null or ${table.sha256} ~ '^[0-9a-f]{64}$'`),
  check("evidence_items_size_check", sql`${table.sizeBytes} is null or (${table.sizeBytes} > 0 and ${table.sizeBytes} <= 5242880)`),
  check("evidence_items_inline_length_check", sql`${table.inlineText} is null or char_length(${table.inlineText}) <= 10000`),
  check("evidence_items_kind_fields_check", sql`(${table.kind} = 'FILE' and ${table.originalFilename} is not null and ${table.inlineText} is null and ${table.creationIdempotencyKey} is null) or (${table.kind} in ('PASTED_TEXT', 'CALL_NOTE') and ${table.status} in ('READY', 'REMOVED') and ${table.inlineText} is not null and ${table.sha256} is not null and ${table.creationIdempotencyKey} is not null and ${table.originalFilename} is null and ${table.storageObjectKey} is null and ${table.declaredMimeType} is null and ${table.detectedMimeType} is null and ${table.sizeBytes} is null and ${table.uploadIdempotencyKey} is null and ${table.uploadExpiresAt} is null and ${table.validationStartedAt} is null and ${table.uploadedAt} is null and ${table.validatedAt} is null and ${table.safeFailureCode} is null)`),
  check("evidence_items_file_lifecycle_check", sql`${table.kind} <> 'FILE' or (${table.status} = 'AWAITING_UPLOAD' and ${table.validationStartedAt} is null and ${table.detectedMimeType} is null and ${table.sha256} is null and ${table.uploadedAt} is null and ${table.validatedAt} is null and ${table.safeFailureCode} is null) or (${table.status} = 'VALIDATING' and ${table.validationStartedAt} is not null and ${table.safeFailureCode} is null) or (${table.status} = 'READY' and ${table.storageObjectKey} is not null and ${table.detectedMimeType} is not null and char_length(btrim(${table.detectedMimeType})) > 0 and ${table.sizeBytes} is not null and ${table.sha256} is not null and ${table.validatedAt} is not null and ${table.safeFailureCode} is null) or (${table.status} = 'REJECTED' and ${table.safeFailureCode} is not null and char_length(btrim(${table.safeFailureCode})) > 0) or ${table.status} = 'REMOVED'`),
]);

export const evidenceExtractionRuns = pgTable("evidence_extraction_runs", {
  id: uuid("id").primaryKey(),
  evidenceItemId: uuid("evidence_item_id").notNull().references(() => evidenceItems.id),
  evidenceSha256: text("evidence_sha256").notNull(),
  status: extractionStatus("status").notNull(),
  idempotencyKey: uuid("idempotency_key").notNull(),
  provider: text("provider").notNull(), model: text("model").notNull(), modelVersion: text("model_version").notNull(),
  promptVersion: text("prompt_version").notNull(), schemaVersion: text("schema_version").notNull(),
  machineOutput: jsonb("machine_output").$type<Record<string, unknown>>(),
  safeFailureCode: text("safe_failure_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }), completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("evidence_extraction_runs_idempotency_key_idx").on(table.idempotencyKey),
  uniqueIndex("evidence_extraction_runs_one_completed_idx").on(table.evidenceItemId, table.evidenceSha256).where(sql`${table.status} = 'COMPLETED'`),
  uniqueIndex("evidence_extraction_runs_one_active_idx").on(table.evidenceItemId, table.evidenceSha256).where(sql`${table.status} in ('PENDING', 'PROCESSING')`),
  index("evidence_extraction_runs_evidence_created_at_idx").on(table.evidenceItemId, table.createdAt, table.id),
  check("evidence_extraction_runs_sha256_check", sql`${table.evidenceSha256} ~ '^[0-9a-f]{64}$'`),
  check("evidence_extraction_runs_metadata_not_blank_check", sql`char_length(btrim(${table.provider})) > 0 and char_length(btrim(${table.model})) > 0 and char_length(btrim(${table.modelVersion})) > 0 and char_length(btrim(${table.promptVersion})) > 0 and char_length(btrim(${table.schemaVersion})) > 0`),
  check("evidence_extraction_runs_lifecycle_check", sql`(${table.status} = 'PENDING' and ${table.startedAt} is null and ${table.completedAt} is null and ${table.machineOutput} is null and ${table.safeFailureCode} is null) or (${table.status} = 'PROCESSING' and ${table.startedAt} is not null and ${table.completedAt} is null and ${table.machineOutput} is null and ${table.safeFailureCode} is null) or (${table.status} = 'COMPLETED' and ${table.startedAt} is not null and ${table.completedAt} is not null and jsonb_typeof(${table.machineOutput}) = 'object' and ${table.safeFailureCode} is null) or (${table.status} = 'FAILED' and ${table.startedAt} is not null and ${table.completedAt} is not null and ${table.machineOutput} is null and char_length(btrim(${table.safeFailureCode})) > 0)`),
]);

export const evidenceExtractionReviews = pgTable("evidence_extraction_reviews", {
  id: uuid("id").primaryKey(),
  extractionRunId: uuid("extraction_run_id").notNull().references(() => evidenceExtractionRuns.id),
  status: extractionReviewStatus("status").notNull(),
  correctedOutput: jsonb("corrected_output").$type<Record<string, unknown>>(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("evidence_extraction_reviews_run_id_idx").on(table.extractionRunId),
  check("evidence_extraction_reviews_output_check", sql`(${table.status} = 'CONFIRMED' and ${table.correctedOutput} is null) or (${table.status} = 'CORRECTED' and jsonb_typeof(${table.correctedOutput}) = 'object')`),
]);

export const caseEvents = pgTable("case_events", {
  id: uuid("id").primaryKey(), caseId: uuid("case_id").notNull().references(() => fraudCases.id),
  eventSequence: integer("event_sequence").notNull(),
  evidenceItemId: uuid("evidence_item_id").references(() => evidenceItems.id),
  eventType: text("event_type").notNull(), actorType: caseEventActor("actor_type").notNull(),
  requestIdempotencyKey: uuid("request_idempotency_key"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("case_events_request_idempotency_key_idx").on(table.requestIdempotencyKey).where(sql`${table.requestIdempotencyKey} is not null`),
  uniqueIndex("case_events_case_id_event_sequence_idx").on(table.caseId, table.eventSequence),
  index("case_events_case_id_occurred_at_idx").on(table.caseId, table.occurredAt, table.id),
  check("case_events_event_sequence_positive_check", sql`${table.eventSequence} > 0`),
  check("case_events_event_type_not_blank_check", sql`char_length(btrim(${table.eventType})) > 0`),
  check("case_events_metadata_object_check", sql`jsonb_typeof(${table.metadata}) = 'object'`),
]);

export const customersRelations = relations(customers, ({ many }) => ({
  accounts: many(accounts),
  beneficiaries: many(beneficiaries),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  customer: one(customers, {
    fields: [accounts.customerId],
    references: [customers.id],
  }),
  payments: many(payments),
}));

export const beneficiariesRelations = relations(
  beneficiaries,
  ({ one, many }) => ({
    customer: one(customers, {
      fields: [beneficiaries.customerId],
      references: [customers.id],
    }),
    payments: many(payments),
  }),
);

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  account: one(accounts, {
    fields: [payments.accountId],
    references: [accounts.id],
  }),
  beneficiary: one(beneficiaries, {
    fields: [payments.beneficiaryId],
    references: [beneficiaries.id],
  }),
  events: many(paymentEvents),
  riskAssessment: one(paymentRiskAssessments),
  intervention: one(paymentInterventions),
  fraudCase: one(fraudCases),
}));

export const fraudCasesRelations = relations(fraudCases, ({ one, many }) => ({
  payment: one(payments, { fields: [fraudCases.paymentId], references: [payments.id] }),
  report: one(fraudCaseReports),
  evidenceItems: many(evidenceItems),
  events: many(caseEvents),
}));
export const fraudCaseReportsRelations = relations(fraudCaseReports, ({ one }) => ({
  fraudCase: one(fraudCases, { fields: [fraudCaseReports.caseId], references: [fraudCases.id] }),
}));
export const evidenceItemsRelations = relations(evidenceItems, ({ one, many }) => ({
  fraudCase: one(fraudCases, { fields: [evidenceItems.caseId], references: [fraudCases.id] }),
  extractionRuns: many(evidenceExtractionRuns),
  events: many(caseEvents),
}));
export const evidenceExtractionRunsRelations = relations(evidenceExtractionRuns, ({ one }) => ({
  evidenceItem: one(evidenceItems, { fields: [evidenceExtractionRuns.evidenceItemId], references: [evidenceItems.id] }),
  review: one(evidenceExtractionReviews),
}));
export const evidenceExtractionReviewsRelations = relations(evidenceExtractionReviews, ({ one }) => ({
  run: one(evidenceExtractionRuns, { fields: [evidenceExtractionReviews.extractionRunId], references: [evidenceExtractionRuns.id] }),
}));
export const caseEventsRelations = relations(caseEvents, ({ one }) => ({
  fraudCase: one(fraudCases, { fields: [caseEvents.caseId], references: [fraudCases.id] }),
  evidenceItem: one(evidenceItems, { fields: [caseEvents.evidenceItemId], references: [evidenceItems.id] }),
}));

export const paymentEventsRelations = relations(paymentEvents, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentEvents.paymentId],
    references: [payments.id],
  }),
}));

export const paymentRiskAssessmentsRelations = relations(
  paymentRiskAssessments,
  ({ one }) => ({
    payment: one(payments, {
      fields: [paymentRiskAssessments.paymentId],
      references: [payments.id],
    }),
  }),
);

export const paymentInterventionsRelations = relations(
  paymentInterventions,
  ({ one }) => ({
    payment: one(payments, {
      fields: [paymentInterventions.paymentId],
      references: [payments.id],
    }),
  }),
);

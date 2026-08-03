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

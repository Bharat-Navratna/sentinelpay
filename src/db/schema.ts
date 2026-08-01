import { relations, sql } from "drizzle-orm";
import {
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
}));

export const paymentEventsRelations = relations(paymentEvents, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentEvents.paymentId],
    references: [payments.id],
  }),
}));

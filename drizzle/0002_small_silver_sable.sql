CREATE TYPE "public"."case_event_actor" AS ENUM('CUSTOMER', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."contact_channel" AS ENUM('PHONE', 'SMS', 'MESSAGING_APP', 'EMAIL', 'SOCIAL_MEDIA', 'WEBSITE', 'IN_PERSON', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."evidence_category" AS ENUM('MESSAGE_CONVERSATION', 'EMAIL', 'MARKETPLACE_CONVERSATION', 'INVESTMENT_ADVERTISEMENT', 'INVOICE_OR_QUOTE', 'PAYMENT_INSTRUCTION', 'RECEIPT_OR_CONFIRMATION', 'CALL_NOTE', 'ORGANISATION_DETAILS', 'OTHER_DOCUMENT');--> statement-breakpoint
CREATE TYPE "public"."evidence_kind" AS ENUM('FILE', 'PASTED_TEXT', 'CALL_NOTE');--> statement-breakpoint
CREATE TYPE "public"."evidence_status" AS ENUM('AWAITING_UPLOAD', 'VALIDATING', 'READY', 'REJECTED', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."extraction_review_status" AS ENUM('CONFIRMED', 'CORRECTED');--> statement-breakpoint
CREATE TYPE "public"."extraction_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."fraud_case_status" AS ENUM('DRAFT', 'SUBMITTED');--> statement-breakpoint
CREATE TYPE "public"."report_indicator" AS ENUM('YES', 'NO', 'UNSURE');--> statement-breakpoint
CREATE TYPE "public"."scam_category" AS ENUM('INVESTMENT', 'PURCHASE', 'IMPERSONATION', 'ROMANCE', 'INVOICE_REDIRECTION', 'OTHER', 'UNSURE');--> statement-breakpoint
CREATE TABLE "case_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"evidence_item_id" uuid,
	"event_type" text NOT NULL,
	"actor_type" "case_event_actor" NOT NULL,
	"request_idempotency_key" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "case_events_event_type_not_blank_check" CHECK (char_length(btrim("case_events"."event_type")) > 0),
	CONSTRAINT "case_events_metadata_object_check" CHECK (jsonb_typeof("case_events"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "evidence_extraction_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"extraction_run_id" uuid NOT NULL,
	"status" "extraction_review_status" NOT NULL,
	"corrected_output" jsonb,
	"reviewed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "evidence_extraction_reviews_output_check" CHECK (("evidence_extraction_reviews"."status" = 'CONFIRMED' and "evidence_extraction_reviews"."corrected_output" is null) or ("evidence_extraction_reviews"."status" = 'CORRECTED' and jsonb_typeof("evidence_extraction_reviews"."corrected_output") = 'object'))
);
--> statement-breakpoint
CREATE TABLE "evidence_extraction_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"evidence_item_id" uuid NOT NULL,
	"evidence_sha256" text NOT NULL,
	"status" "extraction_status" NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"model_version" text NOT NULL,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"machine_output" jsonb,
	"safe_failure_code" text,
	"created_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "evidence_extraction_runs_sha256_check" CHECK ("evidence_extraction_runs"."evidence_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "evidence_extraction_runs_metadata_not_blank_check" CHECK (char_length(btrim("evidence_extraction_runs"."provider")) > 0 and char_length(btrim("evidence_extraction_runs"."model")) > 0 and char_length(btrim("evidence_extraction_runs"."model_version")) > 0 and char_length(btrim("evidence_extraction_runs"."prompt_version")) > 0 and char_length(btrim("evidence_extraction_runs"."schema_version")) > 0),
	CONSTRAINT "evidence_extraction_runs_lifecycle_check" CHECK (("evidence_extraction_runs"."status" = 'PENDING' and "evidence_extraction_runs"."started_at" is null and "evidence_extraction_runs"."completed_at" is null and "evidence_extraction_runs"."machine_output" is null and "evidence_extraction_runs"."safe_failure_code" is null) or ("evidence_extraction_runs"."status" = 'PROCESSING' and "evidence_extraction_runs"."started_at" is not null and "evidence_extraction_runs"."completed_at" is null and "evidence_extraction_runs"."machine_output" is null and "evidence_extraction_runs"."safe_failure_code" is null) or ("evidence_extraction_runs"."status" = 'COMPLETED' and "evidence_extraction_runs"."started_at" is not null and "evidence_extraction_runs"."completed_at" is not null and jsonb_typeof("evidence_extraction_runs"."machine_output") = 'object' and "evidence_extraction_runs"."safe_failure_code" is null) or ("evidence_extraction_runs"."status" = 'FAILED' and "evidence_extraction_runs"."started_at" is not null and "evidence_extraction_runs"."completed_at" is not null and "evidence_extraction_runs"."machine_output" is null and char_length(btrim("evidence_extraction_runs"."safe_failure_code")) > 0))
);
--> statement-breakpoint
CREATE TABLE "evidence_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"kind" "evidence_kind" NOT NULL,
	"category" "evidence_category" NOT NULL,
	"status" "evidence_status" NOT NULL,
	"original_filename" text,
	"storage_object_key" text,
	"declared_mime_type" text,
	"detected_mime_type" text,
	"size_bytes" integer,
	"sha256" text,
	"inline_text" text,
	"captured_at" timestamp with time zone,
	"creation_idempotency_key" uuid,
	"upload_idempotency_key" uuid,
	"upload_expires_at" timestamp with time zone,
	"validation_started_at" timestamp with time zone,
	"uploaded_at" timestamp with time zone,
	"validated_at" timestamp with time zone,
	"safe_failure_code" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "evidence_items_filename_check" CHECK ("evidence_items"."original_filename" is null or (char_length(btrim("evidence_items"."original_filename")) > 0 and char_length("evidence_items"."original_filename") <= 255)),
	CONSTRAINT "evidence_items_sha256_check" CHECK ("evidence_items"."sha256" is null or "evidence_items"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "evidence_items_size_check" CHECK ("evidence_items"."size_bytes" is null or ("evidence_items"."size_bytes" > 0 and "evidence_items"."size_bytes" <= 5242880)),
	CONSTRAINT "evidence_items_inline_length_check" CHECK ("evidence_items"."inline_text" is null or char_length("evidence_items"."inline_text") <= 10000),
	CONSTRAINT "evidence_items_kind_fields_check" CHECK (("evidence_items"."kind" = 'FILE' and "evidence_items"."original_filename" is not null and "evidence_items"."inline_text" is null and "evidence_items"."creation_idempotency_key" is null) or ("evidence_items"."kind" in ('PASTED_TEXT', 'CALL_NOTE') and "evidence_items"."status" in ('READY', 'REMOVED') and "evidence_items"."inline_text" is not null and "evidence_items"."sha256" is not null and "evidence_items"."creation_idempotency_key" is not null and "evidence_items"."original_filename" is null and "evidence_items"."storage_object_key" is null and "evidence_items"."declared_mime_type" is null and "evidence_items"."detected_mime_type" is null and "evidence_items"."size_bytes" is null and "evidence_items"."upload_idempotency_key" is null and "evidence_items"."upload_expires_at" is null and "evidence_items"."validation_started_at" is null and "evidence_items"."uploaded_at" is null and "evidence_items"."validated_at" is null and "evidence_items"."safe_failure_code" is null)),
	CONSTRAINT "evidence_items_file_lifecycle_check" CHECK ("evidence_items"."kind" <> 'FILE' or ("evidence_items"."status" = 'AWAITING_UPLOAD' and "evidence_items"."validation_started_at" is null and "evidence_items"."detected_mime_type" is null and "evidence_items"."sha256" is null and "evidence_items"."uploaded_at" is null and "evidence_items"."validated_at" is null and "evidence_items"."safe_failure_code" is null) or ("evidence_items"."status" = 'VALIDATING' and "evidence_items"."validation_started_at" is not null and "evidence_items"."safe_failure_code" is null) or ("evidence_items"."status" = 'READY' and "evidence_items"."storage_object_key" is not null and "evidence_items"."detected_mime_type" is not null and char_length(btrim("evidence_items"."detected_mime_type")) > 0 and "evidence_items"."size_bytes" is not null and "evidence_items"."sha256" is not null and "evidence_items"."validated_at" is not null and "evidence_items"."safe_failure_code" is null) or ("evidence_items"."status" = 'REJECTED' and "evidence_items"."safe_failure_code" is not null and char_length(btrim("evidence_items"."safe_failure_code")) > 0) or "evidence_items"."status" = 'REMOVED')
);
--> statement-breakpoint
CREATE TABLE "fraud_case_reports" (
	"case_id" uuid PRIMARY KEY NOT NULL,
	"suspected_scam_category" "scam_category",
	"believed_payment_purpose" text,
	"contact_channel" "contact_channel",
	"first_contact_at" timestamp with time zone,
	"discovered_at" timestamp with time zone,
	"discovery_reason" text,
	"narrative" text,
	"pressure_or_urgency" "report_indicator",
	"guaranteed_returns" "report_indicator",
	"told_to_ignore_warnings" "report_indicator",
	"remote_access_requested" "report_indicator",
	"impersonated_organisation" text,
	"additional_support_requested" boolean,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "fraud_case_reports_version_positive_check" CHECK ("fraud_case_reports"."version" > 0),
	CONSTRAINT "fraud_case_reports_purpose_length_check" CHECK ("fraud_case_reports"."believed_payment_purpose" is null or char_length("fraud_case_reports"."believed_payment_purpose") between 1 and 200),
	CONSTRAINT "fraud_case_reports_discovery_reason_length_check" CHECK ("fraud_case_reports"."discovery_reason" is null or char_length("fraud_case_reports"."discovery_reason") between 1 and 500),
	CONSTRAINT "fraud_case_reports_narrative_length_check" CHECK ("fraud_case_reports"."narrative" is null or char_length("fraud_case_reports"."narrative") between 20 and 4000),
	CONSTRAINT "fraud_case_reports_organisation_length_check" CHECK ("fraud_case_reports"."impersonated_organisation" is null or char_length("fraud_case_reports"."impersonated_organisation") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "fraud_cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_id" uuid NOT NULL,
	"case_reference" text NOT NULL,
	"status" "fraud_case_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"submission_idempotency_key" uuid,
	CONSTRAINT "fraud_cases_reference_format_check" CHECK ("fraud_cases"."case_reference" ~ '^SP-[A-F0-9]{12}$'),
	CONSTRAINT "fraud_cases_lifecycle_check" CHECK (("fraud_cases"."status" = 'DRAFT' and "fraud_cases"."submitted_at" is null) or ("fraud_cases"."status" = 'SUBMITTED' and "fraud_cases"."submitted_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_case_id_fraud_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."fraud_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_evidence_item_id_evidence_items_id_fk" FOREIGN KEY ("evidence_item_id") REFERENCES "public"."evidence_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_extraction_reviews" ADD CONSTRAINT "evidence_extraction_reviews_extraction_run_id_evidence_extraction_runs_id_fk" FOREIGN KEY ("extraction_run_id") REFERENCES "public"."evidence_extraction_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_extraction_runs" ADD CONSTRAINT "evidence_extraction_runs_evidence_item_id_evidence_items_id_fk" FOREIGN KEY ("evidence_item_id") REFERENCES "public"."evidence_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_case_id_fraud_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."fraud_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_case_reports" ADD CONSTRAINT "fraud_case_reports_case_id_fraud_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."fraud_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_cases" ADD CONSTRAINT "fraud_cases_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "case_events_request_idempotency_key_idx" ON "case_events" USING btree ("request_idempotency_key") WHERE "case_events"."request_idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "case_events_case_id_occurred_at_idx" ON "case_events" USING btree ("case_id","occurred_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_extraction_reviews_run_id_idx" ON "evidence_extraction_reviews" USING btree ("extraction_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_extraction_runs_idempotency_key_idx" ON "evidence_extraction_runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_extraction_runs_one_completed_idx" ON "evidence_extraction_runs" USING btree ("evidence_item_id","evidence_sha256") WHERE "evidence_extraction_runs"."status" = 'COMPLETED';--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_extraction_runs_one_active_idx" ON "evidence_extraction_runs" USING btree ("evidence_item_id","evidence_sha256") WHERE "evidence_extraction_runs"."status" in ('PENDING', 'PROCESSING');--> statement-breakpoint
CREATE INDEX "evidence_extraction_runs_evidence_created_at_idx" ON "evidence_extraction_runs" USING btree ("evidence_item_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_items_storage_object_key_idx" ON "evidence_items" USING btree ("storage_object_key") WHERE "evidence_items"."storage_object_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_items_creation_idempotency_key_idx" ON "evidence_items" USING btree ("creation_idempotency_key") WHERE "evidence_items"."creation_idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_items_upload_idempotency_key_idx" ON "evidence_items" USING btree ("upload_idempotency_key") WHERE "evidence_items"."upload_idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "evidence_items_case_id_created_at_idx" ON "evidence_items" USING btree ("case_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "fraud_cases_payment_id_idx" ON "fraud_cases" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fraud_cases_case_reference_idx" ON "fraud_cases" USING btree ("case_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "fraud_cases_submission_idempotency_key_idx" ON "fraud_cases" USING btree ("submission_idempotency_key") WHERE "fraud_cases"."submission_idempotency_key" is not null;
CREATE TYPE "public"."payment_intervention_status" AS ENUM('PENDING', 'CANCELLED', 'CONTINUED');--> statement-breakpoint
CREATE TYPE "public"."payment_risk_decision" AS ENUM('ALLOW', 'INTERVENE');--> statement-breakpoint
CREATE TYPE "public"."payment_risk_reason" AS ENUM('NEW_PAYEE', 'AMOUNT_OUTLIER', 'INVESTMENT_SCAM_LANGUAGE');--> statement-breakpoint
CREATE TABLE "payment_interventions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"status" "payment_intervention_status" NOT NULL,
	"copy_version" text NOT NULL,
	"acknowledgement_confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "payment_interventions_copy_version_not_blank_check" CHECK (char_length(btrim("payment_interventions"."copy_version")) > 0),
	CONSTRAINT "payment_interventions_lifecycle_check" CHECK (("payment_interventions"."status" = 'PENDING' and "payment_interventions"."resolved_at" is null and "payment_interventions"."acknowledgement_confirmed" = false) or ("payment_interventions"."status" = 'CANCELLED' and "payment_interventions"."resolved_at" is not null and "payment_interventions"."acknowledgement_confirmed" = false) or ("payment_interventions"."status" = 'CONTINUED' and "payment_interventions"."resolved_at" is not null and "payment_interventions"."acknowledgement_confirmed" = true))
);
--> statement-breakpoint
CREATE TABLE "payment_risk_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"decision" "payment_risk_decision" NOT NULL,
	"score" integer NOT NULL,
	"reason_codes" "payment_risk_reason"[] NOT NULL,
	"facts" jsonb NOT NULL,
	"rule_version" text NOT NULL,
	"evaluated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payment_risk_assessments_score_range_check" CHECK ("payment_risk_assessments"."score" between 0 and 100),
	CONSTRAINT "payment_risk_assessments_rule_version_not_blank_check" CHECK (char_length(btrim("payment_risk_assessments"."rule_version")) > 0),
	CONSTRAINT "payment_risk_assessments_facts_object_check" CHECK (jsonb_typeof("payment_risk_assessments"."facts") = 'object'),
	CONSTRAINT "payment_risk_assessments_decision_score_check" CHECK (("payment_risk_assessments"."decision" = 'ALLOW' and "payment_risk_assessments"."score" < 50) or ("payment_risk_assessments"."decision" = 'INTERVENE' and "payment_risk_assessments"."score" >= 50))
);
--> statement-breakpoint
ALTER TABLE "payment_interventions" ADD CONSTRAINT "payment_interventions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_risk_assessments" ADD CONSTRAINT "payment_risk_assessments_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_interventions_payment_id_idx" ON "payment_interventions" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_risk_assessments_payment_id_idx" ON "payment_risk_assessments" USING btree ("payment_id");

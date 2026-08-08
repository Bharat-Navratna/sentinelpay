ALTER TABLE "case_events" ADD COLUMN "event_sequence" integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "case_events_case_id_event_sequence_idx" ON "case_events" USING btree ("case_id","event_sequence");--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_event_sequence_positive_check" CHECK ("case_events"."event_sequence" > 0);
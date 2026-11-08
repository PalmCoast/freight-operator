CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "carriers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "mc_number" text NOT NULL UNIQUE,
  "dot_number" text NOT NULL,
  "equipment" jsonb NOT NULL,
  "insurance_status" text NOT NULL CHECK ("insurance_status" IN ('active', 'expired', 'pending')),
  "authority_status" text NOT NULL CHECK ("authority_status" IN ('authorized', 'revoked', 'pending')),
  "safety_rating" text NOT NULL CHECK ("safety_rating" IN ('satisfactory', 'conditional', 'unsatisfactory', 'none')),
  "service_states" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lane_rates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "origin_city" text NOT NULL,
  "origin_state" text NOT NULL,
  "destination_city" text NOT NULL,
  "destination_state" text NOT NULL,
  "equipment" text NOT NULL CHECK ("equipment" IN ('dry_van', 'reefer', 'flatbed')),
  "mileage" integer NOT NULL CHECK ("mileage" > 0),
  "rate_per_mile_cents" integer NOT NULL CHECK ("rate_per_mile_cents" > 0),
  "fuel_surcharge_per_mile_cents" integer NOT NULL CHECK ("fuel_surcharge_per_mile_cents" >= 0),
  "margin_bps" integer NOT NULL CHECK ("margin_bps" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "lane_rates_lane_idx" ON "lane_rates" ("origin_city", "origin_state", "destination_city", "destination_state", "equipment");
--> statement-breakpoint
CREATE TABLE "rate_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "raw_text" text NOT NULL,
  "equipment" text,
  "origin_city" text,
  "origin_state" text,
  "destination_city" text,
  "destination_state" text,
  "weight_lbs" integer,
  "pickup_date" text,
  "commodity" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "rate_request_id" uuid NOT NULL UNIQUE REFERENCES "rate_requests"("id"),
  "status" text NOT NULL CHECK ("status" IN ('quoting', 'quoted', 'cancelled')),
  "equipment" text NOT NULL,
  "origin_city" text NOT NULL,
  "origin_state" text NOT NULL,
  "destination_city" text NOT NULL,
  "destination_state" text NOT NULL,
  "weight_lbs" integer NOT NULL,
  "pickup_date" text NOT NULL,
  "commodity" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "operator_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "rate_request_id" uuid NOT NULL REFERENCES "rate_requests"("id"),
  "status" text NOT NULL CHECK ("status" IN ('pending', 'running', 'waiting_approval', 'completed', 'failed', 'rejected')),
  "current_step" text,
  "model" text NOT NULL,
  "locked_by" text,
  "locked_at" timestamptz,
  "last_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "operator_runs_status_idx" ON "operator_runs" ("status", "created_at");
--> statement-breakpoint
CREATE TABLE "operator_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL REFERENCES "operator_runs"("id"),
  "name" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('pending', 'running', 'succeeded', 'failed', 'waiting')),
  "input" jsonb,
  "output" jsonb,
  "error" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 3,
  "idempotency_key" text NOT NULL UNIQUE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "operator_steps_run_name_idx" ON "operator_steps" ("run_id", "name");
--> statement-breakpoint
CREATE TABLE "decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL REFERENCES "operator_runs"("id"),
  "step_name" text NOT NULL,
  "tool_name" text,
  "inputs" jsonb NOT NULL,
  "reasoning" text NOT NULL,
  "outcome" jsonb NOT NULL,
  "attempt" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "decisions_run_idx" ON "decisions" ("run_id", "created_at");
--> statement-breakpoint
CREATE TABLE "quotes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "load_id" uuid NOT NULL REFERENCES "loads"("id"),
  "run_id" uuid NOT NULL UNIQUE REFERENCES "operator_runs"("id"),
  "carrier_id" uuid REFERENCES "carriers"("id"),
  "linehaul_cents" integer NOT NULL,
  "fuel_surcharge_cents" integer NOT NULL,
  "margin_cents" integer NOT NULL,
  "all_in_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "approval_status" text NOT NULL CHECK ("approval_status" IN ('pending', 'approved', 'rejected', 'edited')),
  "edited_all_in_cents" integer,
  "valid_until" text NOT NULL,
  "reasoning" text NOT NULL,
  "sent_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL UNIQUE REFERENCES "operator_runs"("id"),
  "status" text NOT NULL CHECK ("status" IN ('approved', 'rejected', 'edited')),
  "edited_all_in_cents" integer,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expert_examples" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "raw_text" text NOT NULL,
  "origin_state" text NOT NULL,
  "destination_state" text NOT NULL,
  "equipment" text NOT NULL,
  "quote_all_in_cents" integer NOT NULL,
  "notes" text,
  "source" text NOT NULL CHECK ("source" IN ('seed', 'human_correction')),
  "embedding" vector(32) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "expert_examples_embedding_idx" ON "expert_examples" USING hnsw ("embedding" vector_cosine_ops);

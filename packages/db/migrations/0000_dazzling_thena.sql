CREATE TYPE "public"."agent_licence" AS ENUM('runlet_open', 'mit', 'commercial_only', 'private');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."agent_visibility" AS ENUM('draft', 'private', 'unlisted', 'public');--> statement-breakpoint
CREATE TYPE "public"."audit_event_type" AS ENUM('run_queued', 'run_started', 'guardrail_evaluated', 'llm_called', 'action_executed', 'human_review_requested', 'run_completed', 'run_failed', 'connector_health_checked');--> statement-breakpoint
CREATE TYPE "public"."connector_auth_method" AS ENUM('oauth2_pkce', 'oauth2_client_credentials', 'api_key', 'basic_auth', 'webhook_signing');--> statement-breakpoint
CREATE TYPE "public"."connector_health" AS ENUM('healthy', 'degraded', 'expired', 'revoked', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."connector_provider" AS ENUM('zendesk', 'slack', 'github', 'notion', 'salesforce', 'hubspot', 'jira', 'linear', 'custom');--> statement-breakpoint
CREATE TYPE "public"."deployment_env" AS ENUM('sandbox', 'production');--> statement-breakpoint
CREATE TYPE "public"."deployment_status" AS ENUM('saved_draft', 'active', 'paused', 'upgrading', 'error', 'deprecated');--> statement-breakpoint
CREATE TYPE "public"."execution_mode" AS ENUM('async', 'sync');--> statement-breakpoint
CREATE TYPE "public"."flow_status" AS ENUM('draft', 'active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."run_queue_priority" AS ENUM('realtime', 'standard', 'batch');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'success', 'failed', 'guardrail_blocked', 'pending_review', 'timeout', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."trigger_type" AS ENUM('webhook', 'schedule', 'connector_event', 'flow_node', 'api_call', 'manual');--> statement-breakpoint
CREATE TYPE "public"."version_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."workspace_plan" AS ENUM('free', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'admin', 'developer', 'operator', 'viewer');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text
);
--> statement-breakpoint
CREATE TABLE "agent_stars" (
	"agent_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_stars_agent_id_user_id_pk" PRIMARY KEY("agent_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"semver" text NOT NULL,
	"prompt_ref" text,
	"prompt_body" text,
	"model_config" jsonb NOT NULL,
	"input_schema" jsonb NOT NULL,
	"output_schema" jsonb NOT NULL,
	"required_connectors" jsonb NOT NULL,
	"guardrail_rules" jsonb NOT NULL,
	"timeout_seconds" integer DEFAULT 60 NOT NULL,
	"retry_policy" jsonb,
	"changelog_notes" text,
	"version_hash" text,
	"status" "version_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"tagline" text NOT NULL,
	"description_long" text,
	"vertical" text NOT NULL,
	"category" text NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"thumbnail_url" text,
	"status" "agent_status" DEFAULT 'draft' NOT NULL,
	"visibility" "agent_visibility" DEFAULT 'draft' NOT NULL,
	"licence" "agent_licence" DEFAULT 'runlet_open' NOT NULL,
	"author_id" text NOT NULL,
	"fork_origin_id" text,
	"latest_published_version_id" text,
	"star_count" integer DEFAULT 0 NOT NULL,
	"install_count" integer DEFAULT 0 NOT NULL,
	"avg_run_success_rate" real DEFAULT 0 NOT NULL,
	"search_vector" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agents_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"event_type" "audit_event_type" NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"actor" jsonb NOT NULL,
	"payload_hash" text,
	"guardrail_results" jsonb,
	"llm_metadata" jsonb,
	"connector_call" jsonb,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "connectors" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"display_name" text NOT NULL,
	"provider" "connector_provider" NOT NULL,
	"auth_method" "connector_auth_method" NOT NULL,
	"credential_ref" text NOT NULL,
	"granted_scopes" text[] DEFAULT '{}' NOT NULL,
	"health_status" "connector_health" DEFAULT 'unknown' NOT NULL,
	"last_used_at" timestamp,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credential_store" (
	"id" text PRIMARY KEY NOT NULL,
	"connector_id" text NOT NULL,
	"encrypted_data" text NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"agent_version_id" text NOT NULL,
	"instance_name" text NOT NULL,
	"deployment_env" "deployment_env" DEFAULT 'production' NOT NULL,
	"owner_team" text,
	"connector_bindings" jsonb NOT NULL,
	"encrypted_config" text,
	"guardrail_overrides" jsonb,
	"trigger_type" "trigger_type" DEFAULT 'webhook' NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"execution_mode" "execution_mode" DEFAULT 'async' NOT NULL,
	"alert_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_runs_per_hour" integer DEFAULT 1000 NOT NULL,
	"status" "deployment_status" DEFAULT 'saved_draft' NOT NULL,
	"webhook_url" text,
	"webhook_secret" text,
	"run_count" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flow_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"flow_id" text NOT NULL,
	"parent_flow_run_id" text,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"input_payload_ref" text,
	"output_payload_ref" text,
	"node_states" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "flows" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"graph_def" jsonb NOT NULL,
	"input_schema" jsonb,
	"output_schema" jsonb,
	"status" "flow_status" DEFAULT 'draft' NOT NULL,
	"trigger" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "human_review_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"deployment_id" text,
	"input_summary" text,
	"proposed_output" jsonb,
	"confidence_score" real,
	"reviewed_by" text,
	"review_decision" text,
	"review_notes" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"provider" text NOT NULL,
	"state" text NOT NULL,
	"code_verifier" text,
	"redirect_to" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_states_state_unique" UNIQUE("state")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"deployment_id" text,
	"flow_id" text,
	"flow_run_id" text,
	"parent_run_id" text,
	"depth" integer DEFAULT 0 NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"queue_priority" "run_queue_priority" DEFAULT 'standard' NOT NULL,
	"input_payload_ref" text,
	"output_payload_ref" text,
	"trigger_type" "trigger_type" DEFAULT 'api_call' NOT NULL,
	"trigger_metadata" jsonb,
	"duration_ms" integer,
	"llm_tokens_used" integer,
	"llm_cost_usd" real,
	"guardrail_results" jsonb,
	"confidence_score" real,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"session_token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"email_verified" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token"),
	CONSTRAINT "verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "workspace_agents" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"pinned_version_id" text NOT NULL,
	"installed_by" text NOT NULL,
	"installed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "workspace_role" DEFAULT 'developer' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" "workspace_plan" DEFAULT 'free' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_stars" ADD CONSTRAINT "agent_stars_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_stars" ADD CONSTRAINT "agent_stars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_store" ADD CONSTRAINT "credential_store_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_review_requests" ADD CONSTRAINT "human_review_requests_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_review_requests" ADD CONSTRAINT "human_review_requests_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_review_requests" ADD CONSTRAINT "human_review_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_agents" ADD CONSTRAINT "workspace_agents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_agents" ADD CONSTRAINT "workspace_agents_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_agents" ADD CONSTRAINT "workspace_agents_pinned_version_id_agent_versions_id_fk" FOREIGN KEY ("pinned_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_agents" ADD CONSTRAINT "workspace_agents_installed_by_users_id_fk" FOREIGN KEY ("installed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_provider_idx" ON "accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "av_agent_semver_idx" ON "agent_versions" USING btree ("agent_id","semver");--> statement-breakpoint
CREATE INDEX "agents_vertical_idx" ON "agents" USING btree ("vertical");--> statement-breakpoint
CREATE INDEX "agents_status_idx" ON "agents" USING btree ("status","visibility");--> statement-breakpoint
CREATE INDEX "audit_run_idx" ON "audit_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "audit_workspace_idx" ON "audit_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "audit_occurred_at_idx" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "connectors_workspace_provider_idx" ON "connectors" USING btree ("workspace_id","provider");--> statement-breakpoint
CREATE INDEX "deployments_workspace_idx" ON "deployments" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "deployments_status_idx" ON "deployments" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "flow_runs_flow_idx" ON "flow_runs" USING btree ("flow_id");--> statement-breakpoint
CREATE INDEX "flow_runs_workspace_idx" ON "flow_runs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "flows_workspace_idx" ON "flows" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "runs_workspace_idx" ON "runs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "runs_deployment_idx" ON "runs" USING btree ("deployment_id");--> statement-breakpoint
CREATE INDEX "runs_status_idx" ON "runs" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "runs_created_at_idx" ON "runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "wa_workspace_agent_idx" ON "workspace_agents" USING btree ("workspace_id","agent_id");--> statement-breakpoint
CREATE INDEX "wm_workspace_user_idx" ON "workspace_members" USING btree ("workspace_id","user_id");
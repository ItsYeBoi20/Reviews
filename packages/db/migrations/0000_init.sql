CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('movie', 'tv', 'game');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('published', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."sentiment" AS ENUM('positive', 'mixed', 'negative', 'off_topic');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "comment_labels" (
	"snapshot_id" uuid NOT NULL,
	"comment_id" text NOT NULL,
	"sentiment" "sentiment" NOT NULL,
	"weight" real NOT NULL,
	"aspects" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "comment_labels_snapshot_id_comment_id_pk" PRIMARY KEY("snapshot_id","comment_id")
);
--> statement-breakpoint
CREATE TABLE "consensus_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_id" uuid NOT NULL,
	"score" smallint NOT NULL,
	"label" text NOT NULL,
	"confidence" "confidence" NOT NULL,
	"controversy" real NOT NULL,
	"positive_share" real NOT NULL,
	"mixed_share" real NOT NULL,
	"negative_share" real NOT NULL,
	"sample_size" integer NOT NULL,
	"thread_count" integer NOT NULL,
	"summary" text NOT NULL,
	"pros" jsonb NOT NULL,
	"cons" jsonb NOT NULL,
	"quotes" jsonb NOT NULL,
	"sources" jsonb NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"is_sample_data" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reddit_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"title_id" uuid NOT NULL,
	"author_hash" text NOT NULL,
	"body" text,
	"score" integer NOT NULL,
	"permalink" text NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reddit_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"title_id" uuid NOT NULL,
	"subreddit" text NOT NULL,
	"title" text NOT NULL,
	"permalink" text NOT NULL,
	"score" integer NOT NULL,
	"num_comments" integer NOT NULL,
	"relevance" real NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_reports" (
	"review_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_reports_review_id_user_id_pk" PRIMARY KEY("review_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "review_votes" (
	"review_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_votes_review_id_user_id_pk" PRIMARY KEY("review_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"headline" text NOT NULL,
	"body" text NOT NULL,
	"contains_spoilers" boolean DEFAULT false NOT NULL,
	"status" "review_status" DEFAULT 'published' NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "titles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "media_kind" NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"year" smallint,
	"release_date" timestamp with time zone,
	"synopsis" text,
	"poster_url" text,
	"backdrop_url" text,
	"genres" text[] DEFAULT '{}'::text[] NOT NULL,
	"platforms" text[] DEFAULT '{}'::text[] NOT NULL,
	"creators" text[] DEFAULT '{}'::text[] NOT NULL,
	"runtime_minutes" smallint,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reddit_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"popularity" real DEFAULT 0 NOT NULL,
	"user_rating_sum" integer DEFAULT 0 NOT NULL,
	"user_rating_count" integer DEFAULT 0 NOT NULL,
	"consensus_score" smallint,
	"consensus_label" text,
	"consensus_confidence" "confidence",
	"consensus_analyzed_at" timestamp with time zone,
	"consensus_next_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "titles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "comment_labels" ADD CONSTRAINT "comment_labels_snapshot_id_consensus_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."consensus_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consensus_snapshots" ADD CONSTRAINT "consensus_snapshots_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reddit_comments" ADD CONSTRAINT "reddit_comments_thread_id_reddit_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."reddit_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reddit_comments" ADD CONSTRAINT "reddit_comments_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reddit_threads" ADD CONSTRAINT "reddit_threads_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_votes" ADD CONSTRAINT "review_votes_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_votes" ADD CONSTRAINT "review_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consensus_title_created_idx" ON "consensus_snapshots" USING btree ("title_id","created_at");--> statement-breakpoint
CREATE INDEX "reddit_comments_title_idx" ON "reddit_comments" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "reddit_comments_fetched_idx" ON "reddit_comments" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "reddit_threads_title_idx" ON "reddit_threads" USING btree ("title_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_title_user_idx" ON "reviews" USING btree ("title_id","user_id");--> statement-breakpoint
CREATE INDEX "reviews_title_helpful_idx" ON "reviews" USING btree ("title_id","helpful_count");--> statement-breakpoint
CREATE INDEX "reviews_user_idx" ON "reviews" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "titles_kind_popularity_idx" ON "titles" USING btree ("kind","popularity");--> statement-breakpoint
CREATE INDEX "titles_consensus_next_idx" ON "titles" USING btree ("consensus_next_at");--> statement-breakpoint
CREATE INDEX "titles_name_trgm_idx" ON "titles" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_idx" ON "users" USING btree (lower("username"));
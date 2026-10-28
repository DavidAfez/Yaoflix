-- Messages sealed with the old passphrase keys cannot be opened by the new device keys
DELETE FROM "chat_messages";--> statement-breakpoint
DELETE FROM "chat_files";--> statement-breakpoint
CREATE TABLE "chat_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"ecdh" text NOT NULL,
	"sign" text NOT NULL,
	"signed_by" uuid,
	"sig" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"approved_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message_keys" (
	"message_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"from_device" uuid NOT NULL,
	"wrap" text NOT NULL,
	CONSTRAINT "chat_message_keys_message_id_device_id_pk" PRIMARY KEY("message_id","device_id")
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "sender_device" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_devices" ADD CONSTRAINT "chat_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_keys" ADD CONSTRAINT "chat_message_keys_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_devices_user_idx" ON "chat_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_message_keys_device_idx" ON "chat_message_keys" USING btree ("device_id");
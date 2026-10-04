import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  smallint,
  boolean,
  timestamp,
  jsonb,
  serial,
  bigint,
  real,
  date,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["USER", "UPLOADER", "MODERATOR", "DEV"]);
export const requestStatusEnum = pgEnum("request_status", ["PENDING", "IN_PROGRESS", "FULFILLED", "REJECTED"]);
export const mediaStatusEnum = pgEnum("media_status", ["UPLOADING", "QUEUED", "PROCESSING", "READY", "FAILED"]);
export const rejectReasonEnum = pgEnum("reject_reason", [
  "NOT_RELEASED",
  "NO_SOURCE",
  "LOW_QUALITY",
  "NO_LANGUAGE",
  "DUPLICATE",
  "OTHER",
]);

/**
 * Accounts are pseudonymous. The email is never stored in clear:
 * - emailEnc: AES-256-GCM ciphertext, decrypted only by the mailer
 * - emailHash: HMAC-SHA256 blind index used for login and uniqueness
 * No IP address, no real name, no birth date. Only an age bracket and an optional sex.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    handle: text("handle").notNull(),
    emailEnc: text("email_enc").notNull(),
    emailHash: text("email_hash").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("USER"),
    ageBracket: text("age_bracket"),
    sex: text("sex"),
    phoneEnc: text("phone_enc"),
    phoneHash: text("phone_hash"),
    whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
    country: text("country"),
    bannedAt: timestamp("banned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("users_handle_idx").on(t.handle),
    uniqueIndex("users_email_hash_idx").on(t.emailHash),
    uniqueIndex("users_phone_hash_idx").on(t.phoneHash),
  ],
);

/** id is the SHA-256 of the cookie token, so a DB leak does not leak live sessions. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const authTokens = pgTable("auth_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // verify | reset
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

/** Local cache of TMDB metadata. Only used as a search and analytics base. */
export const titles = pgTable(
  "titles",
  {
    id: serial("id").primaryKey(),
    tmdbId: integer("tmdb_id").notNull(),
    kind: text("kind").notNull(), // movie | tv
    name: text("name").notNull(),
    originalName: text("original_name"),
    overview: text("overview"),
    posterPath: text("poster_path"),
    backdropPath: text("backdrop_path"),
    releaseDate: date("release_date"),
    year: integer("year"),
    genres: text("genres").array().notNull().default([]),
    runtime: integer("runtime"),
    voteAverage: real("vote_average"),
    popularity: real("popularity"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("titles_tmdb_idx").on(t.tmdbId, t.kind)],
);

export type Rendition = { height: number; bandwidth: number };
export type Track = { lang: string; label: string; file?: string };

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    titleId: integer("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
    status: mediaStatusEnum("status").notNull().default("UPLOADING"),
    sourceName: text("source_name"),
    sourceSize: bigint("source_size", { mode: "number" }),
    uploadedBytes: bigint("uploaded_bytes", { mode: "number" }).notNull().default(0),
    durationSec: integer("duration_sec"),
    renditions: jsonb("renditions").$type<Rendition[]>().notNull().default([]),
    audioTracks: jsonb("audio_tracks").$type<Track[]>().notNull().default([]),
    subtitles: jsonb("subtitles").$type<Track[]>().notNull().default([]),
    progress: integer("progress").notNull().default(0),
    error: text("error"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
  },
  (t) => [index("media_title_idx").on(t.titleId)],
);

export type RequestPrefs = {
  quality: "auto" | "480" | "720" | "1080" | "2160";
  audio: "any" | "vf" | "vo";
  subs: "none" | "fr" | "en";
};

/** ageBracket, sex, country and recency are snapshotted for analytics that survive account deletion. */
export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    titleId: integer("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
    status: requestStatusEnum("status").notNull().default("PENDING"),
    prefs: jsonb("prefs").$type<RequestPrefs>().notNull(),
    rejectReason: rejectReasonEnum("reject_reason"),
    handledBy: uuid("handled_by").references(() => users.id, { onDelete: "set null" }),
    ageBracket: text("age_bracket"),
    sex: text("sex"),
    country: text("country"),
    recencyYears: integer("recency_years"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    handledAt: timestamp("handled_at", { withTimezone: true }),
  },
  (t) => [index("requests_status_idx").on(t.status), index("requests_user_idx").on(t.userId)],
);

/** Private, expiring watch links. Only the hash of the token is kept. */
export const accessGrants = pgTable(
  "access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").references(() => requests.id, { onDelete: "set null" }),
    prefs: jsonb("prefs").$type<RequestPrefs>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastPositionSec: integer("last_position_sec").notNull().default(0),
  },
  (t) => [uniqueIndex("grants_token_idx").on(t.tokenHash), index("grants_user_idx").on(t.userId)],
);

export const watchlist = pgTable(
  "watchlist",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    titleId: integer("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.titleId] })],
);

export const likes = pgTable(
  "likes",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    titleId: integer("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
    value: smallint("value").notNull(), // 1 | -1
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.titleId] })],
);

/** One visit on the platform, kept alive by heartbeats. activeSec counts visible time only. */
export const platformSessions = pgTable(
  "platform_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    activeSec: integer("active_sec").notNull().default(0),
    country: text("country"),
    device: text("device"),
    ageBracket: text("age_bracket"),
    sex: text("sex"),
  },
  (t) => [index("psessions_started_idx").on(t.startedAt)],
);

export const watchSessions = pgTable(
  "watch_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    mediaId: uuid("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
    titleId: integer("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    watchedSec: integer("watched_sec").notNull().default(0),
    pauses: integer("pauses").notNull().default(0),
    completed: boolean("completed").notNull().default(false),
    country: text("country"),
    device: text("device"),
    ageBracket: text("age_bracket"),
    sex: text("sex"),
  },
  (t) => [index("wsessions_started_idx").on(t.startedAt)],
);

/** Continuous playback between two pauses. The base of the focus metric. */
export const focusSpans = pgTable("focus_spans", {
  id: serial("id").primaryKey(),
  watchSessionId: uuid("watch_session_id").notNull().references(() => watchSessions.id, { onDelete: "cascade" }),
  seconds: integer("seconds").notNull(),
  endedBy: text("ended_by").notNull(), // pause | end | leave
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  titleId: integer("title_id").references(() => titles.id, { onDelete: "set null" }),
  audioFile: text("audio_file").notNull(),
  mime: text("mime").notNull(),
  durationSec: integer("duration_sec"),
  source: text("source").notNull(), // web | whatsapp
  transcript: text("transcript"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const errorLogs = pgTable(
  "error_logs",
  {
    id: serial("id").primaryKey(),
    fingerprint: text("fingerprint").notNull(),
    source: text("source").notNull(), // server | client | player | worker | mail | whatsapp
    message: text("message").notNull(),
    stack: text("stack"),
    context: jsonb("context").$type<Record<string, unknown>>(),
    count: integer("count").notNull().default(1),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [uniqueIndex("errors_fp_idx").on(t.fingerprint)],
);

/** Tiny durable queue processed by the worker: transcodes, mails, WhatsApp messages. */
export const jobs = pgTable(
  "jobs",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("queued"), // queued | running | done | failed
    attempts: integer("attempts").notNull().default(0),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jobs_pick_idx").on(t.status, t.runAt)],
);

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  target: text("target"),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type RejectReason = (typeof rejectReasonEnum.enumValues)[number];

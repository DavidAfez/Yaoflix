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
  type AnyPgColumn,
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
    // Staff lets the member in once the email is confirmed
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("USER"),
    ageBracket: text("age_bracket"),
    sex: text("sex"),
    phoneEnc: text("phone_enc"),
    phoneHash: text("phone_hash"),
    whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
    // Detailed reviews: granted by staff, or unlocked automatically after 10 reviews
    deepReview: boolean("deep_review").notNull().default(false),
    // Home billboard: time per slide in milliseconds, 0 keeps it still
    billboardMs: integer("billboard_ms").notNull().default(3000),
    // Language of the interface and of the mails
    locale: text("locale").notNull().default("fr"),
    // A top 5 post shown at the top of the profile
    pinnedPostId: uuid("pinned_post_id"),
    // Public profile: a short bio and two pictures (ids in the images table)
    bio: text("bio"),
    avatarId: uuid("avatar_id"),
    bannerId: uuid("banner_id"),
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
    // HMAC of the IP with the server pepper: never the IP itself, only used to keep banned people out
    ipHash: text("ip_hash"),
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
    // Series only: number of episodes aired, to estimate the time spent on a whole series
    episodes: integer("episodes"),
    // English name and synopsis, filled the first time an English-speaking member sees the title
    nameEn: text("name_en"),
    overviewEn: text("overview_en"),
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

/** How much the member liked a title, 0.5 to 5 by halves. Rating a title means it was seen. */
export const ratings = pgTable(
  "ratings",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    titleId: integer("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
    score: real("score").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.titleId] })],
);

/** Titles the member refuses to watch. Removed from every suggestion, weighs more than a dislike. */
export const nevers = pgTable(
  "nevers",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    titleId: integer("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.titleId] })],
);

/** Detailed review: one score per criterion (1 to 5) plus quick tags, all tapped, nothing typed. */
export const deepReviews = pgTable(
  "deep_reviews",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    titleId: integer("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
    scores: jsonb("scores").$type<Record<string, number>>().notNull(),
    tags: text("tags").array().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.titleId] }), index("deep_reviews_title_idx").on(t.titleId)],
);

/**
 * Titles the member has seen. Set by hand, or implied by a like, a review or a finished viewing.
 * source keeps why, so an explicit "seen" survives removing a like.
 */
export const seen = pgTable(
  "seen",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    titleId: integer("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // manual | like | review | watch
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
  // A review is a voice note, a short text, or both
  audioFile: text("audio_file"),
  mime: text("mime"),
  text: text("text"),
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

/**
 * The feed. A post talks about a title (or not), may come from a review, may answer another post
 * (parentId) or share it again (repostOf, no body).
 */
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    titleId: integer("title_id").references(() => titles.id, { onDelete: "set null" }),
    feedbackId: uuid("feedback_id").references(() => feedback.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => posts.id, { onDelete: "cascade" }),
    repostOf: uuid("repost_of").references((): AnyPgColumn => posts.id, { onDelete: "cascade" }),
    body: text("body"),
    // text | clip | top5 | tier | poll, the structured part lives in data
    kind: text("kind").notNull().default("text"),
    data: jsonb("data").$type<PostData>(),
    clipId: uuid("clip_id").references((): AnyPgColumn => clips.id, { onDelete: "set null" }),
    // Images, GIFs and stills attached to the post, 4 at most
    media: jsonb("media").$type<PostMedia[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("posts_created_idx").on(t.createdAt),
    index("posts_user_idx").on(t.userId),
    index("posts_parent_idx").on(t.parentId),
    index("posts_repost_idx").on(t.repostOf),
    uniqueIndex("posts_feedback_idx").on(t.feedbackId),
  ],
);

export const postLikes = pgTable(
  "post_likes",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] }), index("post_likes_post_idx").on(t.postId)],
);

export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    followeeId: uuid("followee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followeeId] }), index("follows_followee_idx").on(t.followeeId)],
);

/** A title as posts store it: enough to draw the poster without a lookup. */
export type TitleRef = { kind: string; tmdbId: number; name: string; year: number | null; poster: string | null };
export type TierItem = ({ type: "title" } & TitleRef) | { type: "frame"; clipId: string; label?: string };
export type PostData =
  | { title: string; items: TitleRef[] }
  | { title: string; tiers: { label: string; items: TierItem[] }[] }
  | { question: string; options: { label: string; ref?: TitleRef }[]; answer?: number | null; frameId?: string | null; ref?: TitleRef | null };

/**
 * Pieces cut from a film while watching it: a short video (15 s max) or a still frame.
 * Rendered by the worker from the HLS files, served to signed-in members only.
 */
export const clips = pgTable(
  "clips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
    titleId: integer("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // video | image
    startSec: real("start_sec").notNull(),
    durationSec: real("duration_sec").notNull().default(0),
    status: text("status").notNull().default("QUEUED"), // QUEUED | READY | FAILED
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("clips_user_idx").on(t.userId)],
);

export const pollVotes = pgTable(
  "poll_votes",
  {
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    option: smallint("option").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

export type PostMedia = { type: "image"; id: string } | { type: "frame"; clipId: string } | { type: "gif"; url: string; w: number; h: number };

/** Pictures members attach to posts, chat or their profile. Served to signed-in members only. */
export const images = pgTable("images", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * In-app notifications. kind: ready | rejected | reply | follow | fav | repost.
 * data holds what the line shows (title, handle, link) so rendering needs no join.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    data: jsonb("data").$type<{ title?: string; handle?: string; href?: string; reason?: string }>().notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

/** Content flagged by members: posts, profiles, messages. For a message, the reporter shares the decrypted text. */
export const reports = pgTable(
  "reports",
  {
    id: serial("id").primaryKey(),
    reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
    targetType: text("target_type").notNull(), // post | user | message
    targetId: text("target_id").notNull(),
    targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    note: text("note"),
    snapshot: jsonb("snapshot").$type<{ text?: string; handle?: string; kind?: string }>(),
    status: text("status").notNull().default("open"), // open | removed | dismissed
    handledBy: uuid("handled_by").references(() => users.id, { onDelete: "set null" }),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reports_status_idx").on(t.status)],
);

/** A member who does not want to see or hear from another one. */
export const blocks = pgTable(
  "blocks",
  {
    blockerId: uuid("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

/** Hashed IPs of banned members, refused at signup and login until the date passes. */
export const ipBans = pgTable("ip_bans", {
  ipHash: text("ip_hash").primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  until: timestamp("until", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Profile top 5. Every change saves a new version and archives the previous one,
 * so the history of a member's favourites stays visible.
 */
export const topLists = pgTable(
  "top_lists",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    items: jsonb("items").$type<TitleRef[]>().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("top_lists_user_idx").on(t.userId, t.createdAt)],
);

/**
 * End-to-end encrypted chat. The server only ever holds public keys and ciphertext.
 * Nobody running the server can read the messages.
 */
/**
 * One key set per device, created in the browser. The private halves never leave it (non-extractable
 * WebCrypto keys in IndexedDB); the server only keeps the public halves. A member's first device is
 * the root; each later device is vouched for (ECDSA signature) by one already trusted.
 */
export const chatDevices = pgTable(
  "chat_devices",
  {
    id: uuid("id").primaryKey(), // chosen by the device, part of what it signs
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    ecdh: text("ecdh").notNull(), // P-256 public key, raw, base64
    sign: text("sign").notNull(), // ECDSA P-256 public key, raw, base64
    signedBy: uuid("signed_by"), // null for the root
    sig: text("sig").notNull(),
    label: text("label").notNull().default(""),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_devices_user_idx").on(t.userId)],
);

export const chatThreads = pgTable(
  "chat_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The two members, a < b, so a pair has exactly one thread
    a: uuid("a").notNull().references(() => users.id, { onDelete: "cascade" }),
    b: uuid("b").notNull().references(() => users.id, { onDelete: "cascade" }),
    lastAt: timestamp("last_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("chat_threads_pair_idx").on(t.a, t.b)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id").notNull().references(() => chatThreads.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    senderDevice: uuid("sender_device").notNull(),
    iv: text("iv").notNull(),
    body: text("body").notNull(), // ciphertext under a random per-message key, base64
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_messages_thread_idx").on(t.threadId, t.createdAt)],
);

/** The per-message key, wrapped for one device with ECDH(fromDevice, device). */
export const chatMessageKeys = pgTable(
  "chat_message_keys",
  {
    messageId: uuid("message_id").notNull().references(() => chatMessages.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").notNull(),
    fromDevice: uuid("from_device").notNull(),
    wrap: text("wrap").notNull(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.deviceId] }), index("chat_message_keys_device_idx").on(t.deviceId)],
);

export const chatReads = pgTable(
  "chat_reads",
  {
    threadId: uuid("thread_id").notNull().references(() => chatThreads.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.threadId, t.userId] })],
);

/** Encrypted attachments of a thread: stored as opaque bytes, decrypted in the browser. */
export const chatFiles = pgTable("chat_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").notNull().references(() => chatThreads.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bytes: integer("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

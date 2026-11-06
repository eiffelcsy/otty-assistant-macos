import { chmodSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { DatabaseSync } from 'node:sqlite'

// Otty's local database (D-3): `userData/otty.db`. Saved chats live here, and so will the things Otty learns
// about the user (issue #17) and intent feedback (D-1). One file, so "forget everything" is one place.
// Built-in `node:sqlite`: no native module to rebuild for Electron.

/**
 * Schema migrations, applied in order. `PRAGMA user_version` is the number already applied.
 * Never edit a shipped migration; add a new one.
 */
const MIGRATIONS: string[] = [
  // v1. Allowed values (roles, origins, statuses) are checked in TypeScript, not with CHECK constraints:
  // SQLite can't alter a CHECK, so a new value would mean rebuilding the table.
  `
  create table chats(
    -- A number for the search index to point at: FTS5 finds rows by rowid in O(log n), and an
    -- INTEGER PRIMARY KEY never changes, even on VACUUM.
    num integer primary key,
    id text not null unique,
    title text not null,
    app text,
    created_at integer not null,
    updated_at integer not null,
    -- Pinned chats are never forgotten by the "Keep chats for" setting.
    pinned integer not null default 0,
    -- 0 = "Don't learn from this chat" (D-10): no memories or habit counts come from it.
    learn integer not null default 1
  );
  create index chats_updated on chats(updated_at desc);

  -- Messages as the UI shows them. The JSON is a ChatMessage with pictures emptied; role, id and time are
  -- columns so later features (date filters, sync) can query them without parsing.
  create table messages(
    chat_id text not null references chats(id) on delete cascade,
    seq integer not null,
    id text not null,
    -- 'user' | 'assistant' today.
    role text not null,
    json text not null,
    -- When the message was sent or answered (ms since epoch).
    created_at integer not null,
    primary key (chat_id, seq)
  );

  -- What the model sees, so a reopened chat can carry on. Pictures replaced by a note.
  create table llm_history(
    chat_id text not null references chats(id) on delete cascade,
    seq integer not null,
    json text not null,
    primary key (chat_id, seq)
  );

  -- One row per chat (rowid = chats.num): every searchable field, folded (NFKC, lower case) the way
  -- store/search.ts folds queries. Trigram finds terms of 3+ characters; shorter ones fall back to instr().
  create virtual table chat_search using fts5(text, tokenize = 'trigram');

  -- Things Otty has learned about the user (issue #17, D-10). Saved as Otty learns them, shown under the answer
  -- with an Undo, and listed in Settings where every one can be edited, paused or deleted. Kept apart from chats:
  -- "Forget all chats" leaves these, and forgetting the chat a memory came from only drops the link.
  create table memories(
    id integer primary key,
    -- One plain sentence, written to be shown back to the user: "Is learning Spanish".
    text text not null,
    -- For grouping in Settings: 'about' (who they are), 'preference' (how they like answers), 'habit' (how they
    -- work: apps, languages), 'person' (people they mention), 'goal' (what they're working towards).
    kind text not null default 'about',
    -- How Otty learned it: 'told' ("remember that…"), 'inferred' (from what they said, by the model),
    -- 'observed' (counted on-device: apps, languages, quick actions), 'settings' (typed there).
    origin text not null,
    -- 'active' (sent when relevant), 'paused' (kept, never sent), 'pending' (waiting for the user, e.g. an
    -- unanswered suggestion).
    status text not null default 'active',
    -- 0–1. Told and typed memories are 1; a weak inference is only sent when it matches the question.
    confidence real not null default 1,
    -- The language it was said in, or null for any.
    language text,
    source_chat_id text references chats(id) on delete set null,
    source_message_id text,
    created_at integer not null,
    updated_at integer not null,
    -- For short-lived facts ("travelling to Japan next week"): forgotten after this time. Null = keep.
    expires_at integer,
    -- Retrieval bookkeeping: once the list is too long to send whole, pick the relevant and recently useful ones.
    last_used_at integer,
    use_count integer not null default 0
  );
  create virtual table memories_fts using fts5(text, content = 'memories', content_rowid = 'id', tokenize = 'trigram');
  insert into memories_fts(memories_fts, rank) values ('secure-delete', 1);
  create trigger memories_ai after insert on memories begin
    insert into memories_fts(rowid, text) values (new.id, new.text);
  end;
  create trigger memories_ad after delete on memories begin
    insert into memories_fts(memories_fts, rowid, text) values ('delete', old.id, old.text);
  end;
  create trigger memories_au after update of text on memories begin
    insert into memories_fts(memories_fts, rowid, text) values ('delete', old.id, old.text);
    insert into memories_fts(rowid, text) values (new.id, new.text);
  end;

  -- Per-day counts kept on the Mac: D-10's habits (apps used, answer languages, quick actions) and a future
  -- usage meter (web searches, tokens). Only counts, never content. Day = local date as YYYYMMDD.
  create table counters(
    kind text not null,
    key text not null,
    day integer not null,
    count integer not null default 0,
    primary key (kind, key, day)
  ) without rowid;

  -- D-1: which intent Otty guessed and which the user picked, for retraining on-device. Nothing leaves the Mac.
  -- The embedding (Float32 bytes) is what retraining needs, so the capture's text is never kept here, and
  -- forgetting the chat forgets its feedback.
  create table intent_feedback(
    id integer primary key,
    chat_id text references chats(id) on delete cascade,
    message_id text,
    app text,
    predicted text,
    chosen text,
    probs_json text,
    -- Which classifier made the guess (encoder + head version), so old rows can be weighed or dropped.
    model text,
    embedding blob,
    created_at integer not null
  );
  `,
  // v2. D-10's habits: each one has a stable key, so a count going up refreshes it instead of adding another.
  // Deleting a habit records its key, or the same counts would write it straight back.
  `
  alter table memories add column habit text;
  create unique index memories_habit on memories(habit) where habit is not null;
  create table memory_optouts(
    key text primary key,
    created_at integer not null
  ) without rowid;
  `,
  // v3. D-22's background work. Jobs hold no chat text beyond their brief, and the steps go as soon as one finishes,
  // because the report is what's kept. Allowed statuses are checked in TypeScript.
  `
  create table jobs(
    id text primary key,
    title text not null,
    brief text not null,
    status text not null,
    seed_urls text not null default '[]',
    denied_urls text not null default '[]',
    -- Links, so "why did this happen?" can be answered: the chat that asked and the chat with the report.
    source_thread text,
    result_thread text,
    language text not null default 'en',
    rounds integer not null default 0,
    lookups integer not null default 0,
    worked_ms integer not null default 0,
    -- The address it's asking about. Saved, because no promise can wait until tomorrow.
    wait_url text,
    error text,
    partial integer not null default 0,
    created_at integer not null,
    updated_at integer not null,
    seen_at integer
  );
  create table job_steps(
    job_id text not null references jobs(id) on delete cascade,
    seq integer not null,
    json text not null,
    primary key (job_id, seq)
  ) without rowid;
  `
]

export const SCHEMA_VERSION = MIGRATIONS.length

/** The chat search index, as created by v1. `clear()` rebuilds it from scratch rather than deleting row by row. */
export const CHAT_SEARCH_DDL = "create virtual table chat_search using fts5(text, tokenize = 'trigram')"

/** Opens (creating if needed) and migrates the database. `:memory:` works for tests and as a fallback. */
export function openDatabase(file: string): DatabaseSync {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  if (file !== ':memory:') chmodSync(file, 0o600)
  db.exec(`
    -- Only takes effect on a new, empty file: lets pruning hand pages back with a cheap incremental_vacuum.
    pragma auto_vacuum = incremental;
    -- WAL + normal sync: a write is a sub-millisecond append, and a crash of Otty (not of the Mac) loses nothing.
    pragma journal_mode = wal;
    pragma synchronous = normal;
    pragma foreign_keys = on;
    pragma busy_timeout = 2000;
    pragma temp_store = memory;
    -- Deleted chats are overwritten with zeros, not just unlinked.
    pragma secure_delete = on;
  `)
  migrate(db)
  return db
}

/** After deleting: return free pages to the OS and fold the WAL back in, so nothing deleted lingers in either. */
export function compact(db: DatabaseSync): void {
  db.exec('pragma incremental_vacuum; pragma wal_checkpoint(truncate);')
}

/** On quit: let SQLite refresh its query planner statistics (cheap, and only where they're stale). */
export function closeDatabase(db: DatabaseSync): void {
  try {
    db.exec('pragma optimize')
  } finally {
    db.close()
  }
}

function migrate(db: DatabaseSync): void {
  const { user_version: from } = db.prepare('pragma user_version').get() as { user_version: number }
  if (from > MIGRATIONS.length) throw new Error(`otty.db is from a newer Otty (schema ${from})`)
  for (let v = from; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v])
      db.exec(`pragma user_version = ${v + 1}`)
    })
  }
}

/** Runs `fn` in a transaction, rolling back if it throws. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('begin')
  try {
    const out = fn()
    db.exec('commit')
    return out
  } catch (err) {
    db.exec('rollback')
    throw err
  }
}

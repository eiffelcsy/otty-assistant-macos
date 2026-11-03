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
  // v1
  `
  create table chats(
    id text primary key,
    title text not null,
    app text,
    created_at integer not null,
    updated_at integer not null
  );
  create index chats_updated on chats(updated_at desc);

  -- Messages as the UI shows them. The JSON is a ChatMessage with pictures emptied; role and id are
  -- columns so later features can query them without parsing.
  create table messages(
    chat_id text not null references chats(id) on delete cascade,
    seq integer not null,
    id text not null,
    role text not null check (role in ('user', 'assistant')),
    json text not null,
    primary key (chat_id, seq)
  );

  -- What the model sees, so a reopened chat can carry on. Pictures replaced by a note.
  create table llm_history(
    chat_id text not null references chats(id) on delete cascade,
    seq integer not null,
    json text not null,
    primary key (chat_id, seq)
  );

  -- One row per chat: every searchable field, folded (NFKC, lower case) the way store/search.ts folds queries.
  -- Trigram finds terms of 3+ characters; shorter ones (many Chinese searches) fall back to instr().
  create virtual table chat_search using fts5(chat_id unindexed, text, tokenize = 'trigram');

  -- Things Otty remembers about the user (issue #17). The user sees, edits, pauses and deletes every one in
  -- Settings; nothing is stored silently. Kept apart from chats: "Forget all chats" leaves these, and
  -- forgetting the chat a memory came from only drops the link.
  create table memories(
    id integer primary key,
    -- One plain sentence, written to be shown back to the user: "Is learning Spanish".
    text text not null,
    -- For grouping in Settings: 'about' (who they are), 'preference' (how they like answers), 'person', 'goal'.
    kind text not null default 'about',
    -- How it got here: 'told' ("remember that…"), 'suggested' (Otty asked and the user said yes), 'settings' (typed there).
    origin text not null check (origin in ('told', 'suggested', 'settings')),
    -- The language it was said in, or null for any. Lets a 中文 memory be phrased for 中文 answers.
    language text,
    source_chat_id text references chats(id) on delete set null,
    source_message_id text,
    -- Paused memories are kept but never sent.
    enabled integer not null default 1,
    created_at integer not null,
    updated_at integer not null,
    -- Retrieval bookkeeping: once the list is too long to send whole, pick the relevant and recently useful ones.
    last_used_at integer,
    use_count integer not null default 0
  );
  create virtual table memories_fts using fts5(text, content = 'memories', content_rowid = 'id', tokenize = 'trigram');
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

  -- D-1: which intent Otty guessed and which the user picked, for retraining on-device. Nothing leaves the Mac.
  create table intent_feedback(
    id integer primary key,
    predicted text,
    chosen text,
    probs_json text,
    created_at integer not null
  );
  `
]

export const SCHEMA_VERSION = MIGRATIONS.length

/** Opens (creating if needed) and migrates the database. `:memory:` works for tests. */
export function openDatabase(file: string): DatabaseSync {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  if (file !== ':memory:') chmodSync(file, 0o600)
  db.exec('pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 2000;')
  migrate(db)
  return db
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

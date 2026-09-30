import fs from 'node:fs';
import pg from 'pg';

const LOCAL_NOW = `to_char(LOCALTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')`;
const TRANSLATION_CACHE_LIMIT = 1000;

/** 문자열 리터럴·따옴표 식별자를 같은 길이의 공백으로 가려, 키워드 탐색이 그 안을 건드리지 않게 합니다. */
function maskQuoted(sql) {
  let out = '';
  let quote = null;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (quote) {
      if (ch === quote) {
        if (sql[i + 1] === quote) {
          out += '  ';
          i += 1;
          continue;
        }
        quote = null;
        out += ch;
      } else {
        out += ' ';
      }
    } else {
      if (ch === "'" || ch === '"') quote = ch;
      out += ch;
    }
  }
  return out;
}

function replacePlaceholders(sql) {
  const masked = maskQuoted(sql);
  let out = '';
  let index = 0;
  for (let i = 0; i < sql.length; i += 1) {
    if (masked[i] === '?') {
      index += 1;
      out += `$${index}`;
    } else {
      out += sql[i];
    }
  }
  return out;
}

const CLAUSE_END = /^\s*\b(LIMIT|OFFSET|FETCH|FOR|UNION|EXCEPT|INTERSECT)\b/i;

/**
 * SQLite는 NULL을 가장 작은 값으로 정렬하고 PostgreSQL은 가장 큰 값으로 정렬하므로,
 * NULLS FIRST/LAST가 없는 ORDER BY 항목에 SQLite와 같은 순서를 명시합니다.
 */
function addSqliteNullOrdering(sql) {
  const masked = maskQuoted(sql);
  const pattern = /\bORDER\s+BY\b/gi;
  let out = '';
  let cursor = 0;
  let match;
  while ((match = pattern.exec(masked))) {
    const start = match.index + match[0].length;
    let depth = 0;
    let end = start;
    const cuts = [];
    for (; end < masked.length; end += 1) {
      const ch = masked[end];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        if (depth === 0) break;
        depth -= 1;
      } else if (depth === 0) {
        if (ch === ',') cuts.push(end);
        else if (ch === ';') break;
        else if (/\s/.test(ch) && CLAUSE_END.test(masked.slice(end))) break;
      }
    }
    const bounds = [start, ...cuts.map((c) => c + 1), end];
    const terms = [];
    for (let i = 0; i < bounds.length - 1; i += 1) {
      const raw = sql.slice(bounds[i], i < cuts.length ? cuts[i] : end);
      const term = raw.trim();
      if (!term || /\bNULLS\s+(FIRST|LAST)\s*$/i.test(term)) terms.push(term);
      else if (/\bDESC\s*$/i.test(term)) terms.push(`${term} NULLS LAST`);
      else terms.push(`${term} NULLS FIRST`);
    }
    const trailing = sql.slice(start, end).match(/\s*$/)[0];
    out += `${sql.slice(cursor, start)} ${terms.join(', ')}${trailing}`;
    cursor = end;
    pattern.lastIndex = end;
  }
  return out + sql.slice(cursor);
}

function quoteCamelAliases(sql) {
  return sql.replace(/\bAS\s+([a-z][a-z0-9_]*[A-Z][A-Za-z0-9_]*)\b/g, 'AS "$1"');
}

export function translateSql(sql, { kind, tablesWithId } = {}) {
  if (/\bINSERT\s+OR\s+(REPLACE|IGNORE)\b/i.test(sql)) {
    throw new Error('PostgreSQL에서는 INSERT OR REPLACE/IGNORE 대신 ON CONFLICT를 사용하세요.');
  }
  let text = sql
    .replace(/datetime\(\s*'now'\s*,\s*'localtime'\s*\)/gi, LOCAL_NOW)
    .replace(/\bIFNULL\s*\(/gi, 'COALESCE(');
  text = quoteCamelAliases(text);
  text = addSqliteNullOrdering(text);
  text = replacePlaceholders(text);

  if (kind === 'run' && tablesWithId && !/\bRETURNING\b/i.test(maskQuoted(text))) {
    const insert = text.match(/^\s*INSERT\s+INTO\s+"?(\w+)"?/i);
    if (insert && tablesWithId.has(insert[1].toLowerCase())) text = `${text.trimEnd()} RETURNING id`;
  }
  return text;
}

function connectionConfig() {
  const ssl = /^(1|true|require)$/i.test(process.env.DB_SSL || '') ? { rejectUnauthorized: false } : undefined;
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL, ssl };
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || process.env.DB_DATABASE,
    user: process.env.DB_USER || process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ssl,
  };
}

export function describeConnection() {
  const config = connectionConfig();
  if (config.connectionString) {
    try {
      const url = new URL(config.connectionString);
      return `postgres://${url.hostname}:${url.port || 5432}${url.pathname}`;
    } catch {
      return 'postgres (DATABASE_URL)';
    }
  }
  return `postgres://${config.host}:${config.port}/${config.database || ''}`;
}

/** COUNT(*)·SUM 등 bigint/numeric 결과를 SQLite처럼 JS number로 받습니다. */
const types = {
  getTypeParser(oid, format) {
    if (format !== 'binary' && (oid === 20 || oid === 1700)) {
      return (value) => (value === null ? null : Number(value));
    }
    return pg.types.getTypeParser(oid, format);
  },
};

function sessionTimeZone() {
  const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return /^[\w/+-]+$/.test(tz) ? tz : 'UTC';
}

export async function createPostgresBackend() {
  // datetime('now','localtime')와 같은 시각이 저장되도록 세션 시간대를 Node 프로세스와 맞춥니다.
  const pool = new pg.Pool({
    ...connectionConfig(),
    types,
    max: Number(process.env.DB_POOL_MAX) || 10,
    options: `-c TimeZone=${sessionTimeZone()}`,
  });
  pool.on('error', (error) => {
    console.error('[db] idle PostgreSQL client error:', error.message);
  });

  await pool.query('SELECT 1');

  let tablesWithId = new Set();
  const cache = new Map();

  function translated(kind, sql) {
    const key = `${kind}\u0000${sql}`;
    let text = cache.get(key);
    if (!text) {
      if (cache.size >= TRANSLATION_CACHE_LIMIT) cache.clear();
      text = translateSql(sql, { kind, tablesWithId });
      cache.set(key, text);
    }
    return text;
  }

  const backend = {
    name: 'postgres',
    dialect: 'postgres',
    pool,
    async query(kind, sql, params, tx) {
      const result = await (tx?.client || pool).query(translated(kind, sql), params);
      if (kind === 'get') return result.rows[0];
      if (kind === 'all') return result.rows;
      return { changes: result.rowCount ?? 0, lastInsertRowid: result.rows?.[0]?.id ?? 0 };
    },
    /** 번역 없이 PostgreSQL 문법 그대로 실행합니다 ($1 자리표시자). */
    async raw(text, params, tx) {
      return (tx?.client || pool).query(text, params);
    },
    async exec(sql, tx) {
      await (tx?.client || pool).query(sql);
    },
    async transaction(fn) {
      const client = await pool.connect();
      const store = { active: true, client };
      try {
        await client.query('BEGIN');
        const result = await fn(store);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // 연결이 끊긴 경우
        }
        throw error;
      } finally {
        store.active = false;
        client.release();
      }
    },
    async ensureSchema(schemaPath) {
      await pool.query(fs.readFileSync(schemaPath, 'utf8'));
      await backend.refreshTableInfo();
    },
    async refreshTableInfo() {
      const { rows } = await pool.query(
        `SELECT table_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND column_name = 'id'`
      );
      tablesWithId = new Set(rows.map((row) => row.table_name.toLowerCase()));
      cache.clear();
    },
    async close() {
      await pool.end();
    },
  };
  return backend;
}

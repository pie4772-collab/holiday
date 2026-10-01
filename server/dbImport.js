import { createHash } from 'node:crypto';

const IMPORT_META_KEY = 'sqlite_import';
const IMPORT_LOCK_ID = 72120001;
const MAX_PARAMS_PER_INSERT = 30000;
const SKIP_TABLES = new Set(['schema_migrations']);

function importError(message) {
  return new Error(`[db] SQLite → PostgreSQL 이전 실패: ${message}`);
}

function convertValue(value, dataType, where) {
  if (value === null || value === undefined) return null;
  if (dataType === 'integer' || dataType === 'bigint' || dataType === 'smallint') {
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
    throw importError(`${where} 값 ${JSON.stringify(value)}을(를) 정수로 바꿀 수 없습니다.`);
  }
  if (dataType === 'double precision' || dataType === 'real' || dataType === 'numeric') {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    throw importError(`${where} 값 ${JSON.stringify(value)}을(를) 숫자로 바꿀 수 없습니다.`);
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  throw importError(`${where} 값의 형식(${typeof value})을 옮길 수 없습니다.`);
}

function rowHash(rows, columns) {
  const hash = createHash('sha256');
  for (const row of rows) hash.update(JSON.stringify(columns.map((column) => row[column] ?? null)));
  return hash.digest('hex');
}

async function pgTableColumns(backend, tx) {
  const { rows } = await backend.raw(
    `SELECT c.table_name, c.column_name, c.data_type
     FROM information_schema.columns c
     JOIN information_schema.tables t
       ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
     WHERE c.table_schema = current_schema()
     ORDER BY c.table_name, c.ordinal_position`,
    [],
    tx
  );
  const tables = new Map();
  for (const row of rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, []);
    tables.get(row.table_name).push({ name: row.column_name, dataType: row.data_type });
  }
  return tables;
}

async function pgPrimaryKey(backend, table, tx) {
  const { rows } = await backend.raw(
    `SELECT a.attname AS name
     FROM pg_index i
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = $1::regclass AND i.indisprimary
     ORDER BY array_position(i.indkey, a.attnum)`,
    [table],
    tx
  );
  return rows.map((row) => row.name);
}

/**
 * SQLite는 외래키 검사가 꺼진 채 쓰인 적이 있어 부모 없는 행이 남아 있을 수 있습니다.
 * 부모가 지워졌을 때의 규칙(ON DELETE)을 그대로 적용해 CASCADE는 제외하고 SET NULL은 비웁니다.
 */
function applyOrphanRules(table, rows, foreignKeys, parentIds, report) {
  if (!foreignKeys.length) return rows;
  const kept = [];
  for (const row of rows) {
    let drop = false;
    for (const fk of foreignKeys) {
      const value = row[fk.from];
      if (value == null) continue;
      const parents = parentIds.get(`${fk.table}.${fk.to}`);
      if (!parents || parents.has(Number(value)) || parents.has(String(value))) continue;
      if (fk.on_delete === 'CASCADE') {
        drop = true;
        report.push(`${table}: ${fk.from}=${value} 부모(${fk.table}) 없음 → 행 제외`);
        break;
      }
      if (fk.on_delete === 'SET NULL') {
        report.push(`${table}: ${fk.from}=${value} 부모(${fk.table}) 없음 → NULL`);
        row[fk.from] = null;
      }
    }
    if (!drop) kept.push(row);
  }
  return kept;
}

/**
 * PostgreSQL이 비어 있으면 SQLite 파일의 모든 데이터를 한 트랜잭션으로 옮기고,
 * 표마다 행 수와 내용 해시를 대조한 뒤에만 커밋합니다. 실패하면 PostgreSQL은 빈 채로 남습니다.
 */
export async function importSqliteIfEmpty(pgDb, openSource, { sourceLabel }) {
  const backend = pgDb.backend;
  const probe = await backend.raw(
    `SELECT (SELECT COUNT(*) FROM employees) AS employees,
            (SELECT COUNT(*) FROM app_meta WHERE key = $1) AS imported`,
    [IMPORT_META_KEY]
  );
  if (Number(probe.rows[0].employees) > 0 || Number(probe.rows[0].imported) > 0) return null;

  const source = await openSource();
  if (!source) return null;
  try {
    return await pgDb.transaction((tx) => runImport(backend, source, sourceLabel, tx));
  } finally {
    await source.close();
  }
}

async function runImport(backend, source, sourceLabel, tx) {
  await backend.raw('SELECT pg_advisory_xact_lock($1)', [IMPORT_LOCK_ID], tx);
  const recheck = await backend.raw('SELECT COUNT(*) AS c FROM employees', [], tx);
  if (Number(recheck.rows[0].c) > 0) return null;
  await backend.raw('SET CONSTRAINTS ALL DEFERRED', [], tx);

  const pgTables = await pgTableColumns(backend, tx);
  const sourceTables = new Set(
    (await source.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all()).map(
      (row) => row.name
    )
  );

  const plan = [];
  const parentKeys = new Set();
  for (const [table, columns] of pgTables) {
    if (SKIP_TABLES.has(table) || !sourceTables.has(table)) continue;
    const sourceColumns = new Set(
      (await source.prepare(`SELECT name FROM pragma_table_info(?)`).all(table)).map((row) => row.name)
    );
    const shared = columns.filter((column) => sourceColumns.has(column.name));
    const foreignKeys = (await source.prepare(`SELECT * FROM pragma_foreign_key_list(?)`).all(table)).map((fk) => ({
      ...fk,
      on_delete: String(fk.on_delete || '').toUpperCase(),
    }));
    for (const fk of foreignKeys) parentKeys.add(`${fk.table}.${fk.to}`);
    plan.push({ table, shared, foreignKeys, primaryKey: await pgPrimaryKey(backend, table, tx) });
  }

  const parentIds = new Map();
  for (const key of parentKeys) {
    const [table, column] = key.split('.');
    if (!sourceTables.has(table)) continue;
    const rows = await source.prepare(`SELECT "${column}" AS v FROM "${table}"`).all();
    parentIds.set(key, new Set(rows.map((row) => (typeof row.v === 'number' ? row.v : String(row.v)))));
  }

  // AUTOINCREMENT는 지워진 행의 번호도 다시 쓰지 않으므로, 그 최댓값을 시퀀스 시작점으로 이어받습니다.
  const sqliteSequence = new Map();
  const hasSequenceTable = await source
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'`)
    .get();
  if (hasSequenceTable) {
    for (const row of await source.prepare('SELECT name, seq FROM sqlite_sequence').all()) {
      sqliteSequence.set(row.name, Number(row.seq) || 0);
    }
  }

  const orphanReport = [];
  const summary = {};
  for (const { table, shared, foreignKeys, primaryKey } of plan) {
    const columnNames = shared.map((column) => column.name);
    const orderBy = (primaryKey.length ? primaryKey : [columnNames[0]]).map((name) => `"${name}"`).join(', ');
    const sourceRows = await source.prepare(`SELECT * FROM "${table}" ORDER BY ${orderBy}`).all();
    const converted = sourceRows.map((row) => {
      const out = {};
      for (const column of shared) {
        const where = `${table}.${column.name} (행 ${primaryKey.map((k) => row[k]).join(',') || '?'})`;
        out[column.name] = convertValue(row[column.name], column.dataType, where);
      }
      return out;
    });
    const rows = applyOrphanRules(table, converted, foreignKeys, parentIds, orphanReport);

    // 마이그레이션이 넣어 둔 기본값(예: 근태 사업장 설정)은 원본 데이터로 대체합니다.
    await backend.raw(`DELETE FROM "${table}"`, [], tx);
    const perInsert = Math.max(1, Math.floor(MAX_PARAMS_PER_INSERT / Math.max(1, columnNames.length)));
    const columnList = columnNames.map((name) => `"${name}"`).join(', ');
    for (let offset = 0; offset < rows.length; offset += perInsert) {
      const chunk = rows.slice(offset, offset + perInsert);
      const params = [];
      const values = chunk.map((row) => {
        const slots = columnNames.map((name) => {
          params.push(row[name]);
          return `$${params.length}`;
        });
        return `(${slots.join(', ')})`;
      });
      await backend.raw(`INSERT INTO "${table}" (${columnList}) VALUES ${values.join(', ')}`, params, tx);
    }

    if (columnNames.includes('id')) {
      await backend.raw(
        `SELECT setval(seq, GREATEST(last_id, 1), last_id > 0)
         FROM (
           SELECT pg_get_serial_sequence($1, 'id') AS seq,
                  GREATEST(COALESCE(MAX(id), 0), $2::integer) AS last_id
           FROM "${table}"
         ) s
         WHERE seq IS NOT NULL`,
        [table, sqliteSequence.get(table) || 0],
        tx
      );
    }

    const stored = await backend.raw(`SELECT ${columnList} FROM "${table}" ORDER BY ${orderBy}`, [], tx);
    if (stored.rows.length !== rows.length) {
      throw importError(`${table} 행 수가 다릅니다 (원본 ${rows.length}, 이전 ${stored.rows.length}).`);
    }
    if (rowHash(stored.rows, columnNames) !== rowHash(rows, columnNames)) {
      throw importError(`${table} 내용이 원본과 다릅니다.`);
    }
    summary[table] = rows.length;
  }

  await backend.raw('SET CONSTRAINTS ALL IMMEDIATE', [], tx);

  const meta = {
    source: sourceLabel,
    importedAt: new Date().toISOString(),
    tables: summary,
    orphans: orphanReport,
  };
  await backend.raw(
    `INSERT INTO app_meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [IMPORT_META_KEY, JSON.stringify(meta)],
    tx
  );
  return meta;
}

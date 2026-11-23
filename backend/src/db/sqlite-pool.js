import crypto from "node:crypto";

const DATE_FIELDS = new Set([
  "registered_at",
  "created_at",
  "updated_at",
  "accepted_at",
  "resolved_at",
  "responded_at",
]);

export function translateQuery(sql, values = []) {
  let translatedSql = sql;
  let createdCheck = false;

  // 1. Detect (xmax = 0) AS created in upsert RETURNING
  if (/\(xmax\s*=\s*0\)\s*AS\s*created/i.test(translatedSql)) {
    createdCheck = true;
    translatedSql = translatedSql.replace(/,\s*\(xmax\s*=\s*0\)\s*AS\s*created/gi, "");
  }

  // 2. LEAST / GREATEST -> MIN / MAX
  translatedSql = translatedSql.replace(/\bLEAST\b/gi, "MIN");
  translatedSql = translatedSql.replace(/\bGREATEST\b/gi, "MAX");

  // 3. intervals: now() - interval 'X seconds' and now()
  translatedSql = translatedSql.replace(
    /\bnow\(\)\s*-\s*interval\s*'(\d+)\s*seconds'/gi,
    "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-$1 seconds')"
  );
  translatedSql = translatedSql.replace(/\bnow\(\)/gi, "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");

  // 4. Tokenize = ANY($N::bigint[]) or = ANY($N) before stripping casts
  translatedSql = translatedSql.replace(
    /=\s*ANY\s*\(\s*\$(\d+)(?:::bigint\[\])?\s*\)/gi,
    "__ANY_$1__"
  );

  // 5. Strip PostgreSQL type casts (e.g. ::uuid, ::bigint[], ::jsonb, etc.)
  translatedSql = translatedSql.replace(/::[a-zA-Z0-9_\[\]]+/g, "");

  // 6. Replace placeholders and expand parameters in exact appearance order
  const newParams = [];
  translatedSql = translatedSql.replace(
    /(__ANY_(\d+)__|\$(\d+))/g,
    (_match, _anyToken, anyIdx, dollarIdx) => {
      if (anyIdx) {
        const idx = parseInt(anyIdx, 10) - 1;
        const arr = Array.isArray(values[idx]) ? values[idx] : [];
        if (arr.length === 0) {
          return "IN (NULL)";
        }
        for (const item of arr) {
          newParams.push(item instanceof Date ? item.toISOString() : item);
        }
        return `IN (${arr.map(() => "?").join(", ")})`;
      }
      const idx = parseInt(dollarIdx, 10) - 1;
      const val = values[idx];
      newParams.push(val instanceof Date ? val.toISOString() : val);
      return "?";
    }
  );

  return {
    sql: translatedSql,
    params: newParams,
    createdCheck,
  };
}

export function normalizeRow(row) {
  if (!row || typeof row !== "object") {
    return row;
  }
  const result = { ...row };

  if (result.github_id !== undefined && result.github_id !== null) {
    result.github_id = String(result.github_id);
  }

  if (typeof result.preferences === "string") {
    try {
      result.preferences = JSON.parse(result.preferences);
    } catch {
      // keep original string if parse fails
    }
  }

  for (const field of DATE_FIELDS) {
    if (result[field] !== undefined && result[field] !== null) {
      const val = result[field];
      if (typeof val === "string") {
        const iso = val.includes("T") ? val : val.replace(" ", "T") + (val.endsWith("Z") ? "" : "Z");
        const date = new Date(iso);
        if (!Number.isNaN(date.getTime())) {
          result[field] = date.toISOString();
        }
      }
    }
  }

  return result;
}

export function wrapSqliteAsPool(db) {
  try {
    db.function("gen_random_uuid", () => crypto.randomUUID());
  } catch {
    // function may already be registered
  }

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  return {
    async query(sql, values = []) {
      const { sql: translatedSql, params, createdCheck } = translateQuery(sql, values);

      let wasCreated = true;
      if (createdCheck) {
        try {
          const githubId = values[0];
          const existing = db.prepare("SELECT 1 FROM users WHERE github_id = ?").get(githubId);
          wasCreated = !existing;
        } catch {
          // fallback if table doesn't exist yet
        }
      }

      try {
        const stmt = db.prepare(translatedSql);
        if (stmt.reader) {
          const rawRows = stmt.all(...params);
          const rows = rawRows.map((rawRow) => {
            const row = normalizeRow(rawRow);
            if (createdCheck) {
              row.created = wasCreated;
            }
            return row;
          });
          return { rows, rowCount: rows.length };
        }

        const info = stmt.run(...params);
        return { rows: [], rowCount: info.changes };
      } catch (error) {
        if (
          error.code === "SQLITE_CONSTRAINT_UNIQUE"
          || error.code === "SQLITE_CONSTRAINT"
          || (typeof error.message === "string" && error.message.includes("UNIQUE constraint failed"))
        ) {
          error.code = "23505";
          if (typeof error.message === "string") {
            if (error.message.includes("friend_requests_active_pair_idx")) {
              error.constraint = "friend_requests_active_pair_idx";
            } else if (error.message.includes("friendships")) {
              error.constraint = "friendships_user_a_id_user_b_id_key";
            }
          }
        }
        throw error;
      }
    },

    async connect() {
      return {
        query: this.query.bind(this),
        release: () => {},
      };
    },

    async end() {
      db.close();
    },

    close() {
      db.close();
    },
  };
}

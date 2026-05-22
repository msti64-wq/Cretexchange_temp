export type DatabaseErrorCategory =
  | "schema_mismatch"
  | "enum_mismatch"
  | "null_violation"
  | "foreign_key_violation"
  | "unique_violation"
  | "constraint_violation"
  | "other";

export interface DatabaseErrorSummary {
  category: DatabaseErrorCategory;
  code?: string;
  table?: string;
  column?: string;
  constraint?: string;
  detail?: string;
  phase?: string;
  message: string;
}

type PgErrorLike = {
  code?: string;
  message?: string;
  table?: string;
  column?: string;
  constraint?: string;
  detail?: string;
};

function extractFromMessage(
  message: string,
): Pick<DatabaseErrorSummary, "table" | "column" | "constraint"> {
  const missingColumnMatch = message.match(
    /column "([^"]+)" of relation "([^"]+)" does not exist/i,
  );
  if (missingColumnMatch) {
    return {
      column: missingColumnMatch[1],
      table: missingColumnMatch[2],
    };
  }

  const nullViolationMatch = message.match(
    /null value in column "([^"]+)" of relation "([^"]+)" violates not-null constraint/i,
  );
  if (nullViolationMatch) {
    return {
      column: nullViolationMatch[1],
      table: nullViolationMatch[2],
    };
  }

  const enumMatch = message.match(
    /invalid input value for enum ([^:]+): "([^"]+)"/i,
  );
  if (enumMatch) {
    return {};
  }

  const fkMatch = message.match(
    /violates foreign key constraint "([^"]+)"/i,
  );
  if (fkMatch) {
    return {
      constraint: fkMatch[1],
    };
  }

  const uniqueMatch = message.match(
    /violates unique constraint "([^"]+)"/i,
  );
  if (uniqueMatch) {
    return {
      constraint: uniqueMatch[1],
    };
  }

  const undefinedTypeMatch = message.match(
    /type "([^"]+)" does not exist/i,
  );
  if (undefinedTypeMatch) {
    return {};
  }

  return {};
}

export function summarizeDatabaseError(
  error: unknown,
  context?: { phase?: string; table?: string },
): DatabaseErrorSummary {
  const rawError = error as PgErrorLike | undefined;
  const message = rawError?.message || (error instanceof Error ? error.message : String(error));
  const extracted = extractFromMessage(message);
  const code = rawError?.code;

  let category: DatabaseErrorCategory = "other";
  if (code === "42703" || /does not exist/i.test(message)) {
    category = "schema_mismatch";
  } else if (code === "22P02" && /enum/i.test(message)) {
    category = "enum_mismatch";
  } else if (code === "23502") {
    category = "null_violation";
  } else if (code === "23503") {
    category = "foreign_key_violation";
  } else if (code === "23505") {
    category = "unique_violation";
  } else if (code === "42804" || /type .* does not exist/i.test(message)) {
    category = "enum_mismatch";
  } else if (code === "23514") {
    category = "constraint_violation";
  }

  const table = rawError?.table || extracted.table || context?.table;
  const column = rawError?.column || extracted.column;
  const constraint = rawError?.constraint || extracted.constraint;
  const detail = rawError?.detail;

  return {
    category,
    code,
    table,
    column,
    constraint,
    detail,
    phase: context?.phase,
    message,
  };
}


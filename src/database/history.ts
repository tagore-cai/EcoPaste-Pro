import { exists, remove } from "@tauri-apps/plugin-fs";
import type { AnyObject } from "antd/es/_util/type";
import type { SelectQueryBuilder } from "kysely";
import type { DatabaseSchema, DatabaseSchemaHistory } from "@/types/database";
import { getSaveImagePath, join } from "@/utils/path";
import { getDatabase, historyColumns } from ".";

type QueryBuilder = SelectQueryBuilder<DatabaseSchema, "history", AnyObject>;

export const selectHistory = async (
  fn?: (qb: QueryBuilder) => QueryBuilder,
) => {
  const db = await getDatabase();

  let qb = db
    .selectFrom("history")
    .select(historyColumns as (keyof DatabaseSchemaHistory)[]) as QueryBuilder;

  if (fn) {
    qb = fn(qb);
  }

  return qb.execute() as Promise<DatabaseSchemaHistory[]>;
};

export const insertHistory = async (data: DatabaseSchemaHistory) => {
  const db = await getDatabase();

  return db.insertInto("history").values(data).execute();
};

export const updateHistory = async (
  id: string,
  nextData: Partial<DatabaseSchemaHistory>,
) => {
  const db = await getDatabase();

  return db.updateTable("history").set(nextData).where("id", "=", id).execute();
};

export const deleteHistory = async (
  data: DatabaseSchemaHistory,
  deleteLocalFile = true,
) => {
  const { id, type, value } = data;

  const db = await getDatabase();

  await db.deleteFrom("history").where("id", "=", id).execute();

  if (!deleteLocalFile || type !== "image") return;

  const saveImagePath = getSaveImagePath();

  const rawPaths: string[] = Array.isArray(value)
    ? value.map(String).filter(Boolean)
    : typeof value === "string" && value
      ? [value]
      : [];

  for (const raw of rawPaths) {
    const resolvedPath =
      raw.startsWith(saveImagePath) ||
      /^[a-zA-Z]:[\\/]/.test(raw) ||
      raw.startsWith("/")
        ? raw
        : join(saveImagePath, raw);

    if (await exists(resolvedPath)) {
      await remove(resolvedPath);
    }
  }
};

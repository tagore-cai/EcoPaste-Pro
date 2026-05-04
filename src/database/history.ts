import { exists, remove } from "@tauri-apps/plugin-fs";
import { getTypeDbCondition } from "@/constants/contentTypes";
import type { DatabaseSchemaHistory } from "@/types/database";
import { dayjs } from "@/utils/dayjs";
import { getSaveImagePath, join } from "@/utils/path";
import { getDatabase, historyColumns } from ".";

// ─── 查询参数类型 ───

export interface ListHistoryParams {
  group?: string;
  search?: string;
  /** Unix 毫秒时间戳 [start, end] */
  dateRange?: [number, number];
  filterTags?: string[];
  favorite?: boolean;
  offset?: number;
  limit?: number;
}

export interface AggregateHistoryParams {
  dateRange?: [string, string];
  favorite?: boolean;
}

export interface AggregateRow {
  type: string;
  subtype: string | null;
  count: number;
  totalSize: number;
}

// ─── 增 ───

export const insertHistory = async (data: DatabaseSchemaHistory) => {
  const db = await getDatabase();

  return db.insertInto("history").values(data).execute();
};

// ─── 删 ───

export const removeHistoryById = async (id: string) => {
  const db = await getDatabase();

  return db.deleteFrom("history").where("id", "=", id).execute();
};

export const removeHistoryByIds = async (ids: string[]) => {
  if (ids.length === 0) return;

  const db = await getDatabase();

  return db.deleteFrom("history").where("id", "in", ids).execute();
};

export const removeHistoryWhere = async (where: {
  favorite?: boolean;
  type?: string;
  subtype?: string | null;
  subtypeLike?: string;
  dateRange?: [string, string];
}) => {
  const db = await getDatabase();
  const { dateRange, favorite, type, subtype, subtypeLike } = where;

  if (
    favorite === undefined &&
    type === undefined &&
    subtype === undefined &&
    subtypeLike === undefined &&
    !dateRange
  ) {
    throw new Error("removeHistoryWhere: at least one condition is required");
  }

  let qb = db.deleteFrom("history");

  if (favorite !== undefined) {
    qb = qb.where("favorite", "=", favorite);
  }
  if (type !== undefined) {
    qb = qb.where("type", "=", type as any);
  }
  if (subtype !== undefined) {
    if (subtype === null) {
      qb = qb.where("subtype", "is", null);
    } else {
      qb = qb.where("subtype", "=", subtype);
    }
  }
  if (subtypeLike !== undefined) {
    qb = qb.where("subtype", "like", subtypeLike);
  }
  if (dateRange) {
    qb = qb.where((eb) =>
      eb.and([
        eb("createTime", ">=", dateRange[0]),
        eb("createTime", "<=", dateRange[1]),
      ]),
    );
  }

  return qb.execute();
};

// ─── 改 ───

export const updateHistory = async (
  id: string,
  data: Partial<DatabaseSchemaHistory>,
) => {
  const db = await getDatabase();

  return db.updateTable("history").set(data).where("id", "=", id).execute();
};

// ─── 查 ───

export const getHistoryById = async (id: string) => {
  const db = await getDatabase();

  const rows = await db
    .selectFrom("history")
    .select(historyColumns as (keyof DatabaseSchemaHistory)[])
    .where("id", "=", id)
    .execute();

  return rows[0] as DatabaseSchemaHistory | undefined;
};

export const findHistoryByTypeAndValue = async (
  type: string,
  value: string,
) => {
  const db = await getDatabase();

  const rows = await db
    .selectFrom("history")
    .select(historyColumns as (keyof DatabaseSchemaHistory)[])
    .where("type", "=", type as any)
    .where("value", "=", value)
    .execute();

  return rows[0] as DatabaseSchemaHistory | undefined;
};

export const listHistory = async (params: ListHistoryParams) => {
  const db = await getDatabase();
  const { dateRange, filterTags, favorite, group, limit, offset, search } =
    params;

  let qb = db
    .selectFrom("history")
    .select(historyColumns as (keyof DatabaseSchemaHistory)[]);

  if (dateRange) {
    const fmt = "YYYY-MM-DD HH:mm:ss";
    const start = dayjs(dateRange[0]).format(fmt);
    const end = dayjs(dateRange[1]).format(fmt);
    qb = qb.where((eb) =>
      eb.and([eb("createTime", ">=", start), eb("createTime", "<=", end)]),
    );
  }

  if (filterTags && filterTags.length > 0) {
    qb = qb.where((eb) => {
      const conditions: any[] = [];

      if (filterTags.includes("text")) {
        conditions.push(
          eb.and([eb("type", "=", "text"), eb("subtype", "is", null)]),
        );
      }
      if (filterTags.includes("rtf")) {
        conditions.push(eb("type", "=", "rtf"));
      }
      if (filterTags.includes("html")) {
        conditions.push(eb("type", "=", "html"));
      }
      if (filterTags.includes("image")) {
        conditions.push(eb("type", "=", "image"));
      }
      if (filterTags.includes("url")) {
        conditions.push(eb("subtype", "=", "url"));
      }
      if (filterTags.includes("code")) {
        conditions.push(eb("subtype", "like", "code_%"));
      }
      if (filterTags.includes("markdown")) {
        conditions.push(eb("subtype", "=", "markdown"));
      }
      if (filterTags.includes("path")) {
        conditions.push(eb("subtype", "=", "path"));
      }
      if (filterTags.includes("email")) {
        conditions.push(eb("subtype", "=", "email"));
      }
      if (filterTags.includes("color")) {
        conditions.push(eb("subtype", "=", "color"));
      }
      if (filterTags.includes("command")) {
        conditions.push(eb("subtype", "=", "command"));
      }
      if (filterTags.includes("files")) {
        conditions.push(eb("type", "=", "files"));
      }

      if (conditions.length === 0) return eb("id", "is", null);
      if (conditions.length === 1) return conditions[0];
      return eb.or(conditions);
    });
  }

  if (favorite === true) {
    qb = qb.where("favorite", "=", true);
  } else if (favorite === false) {
    qb = qb.where("favorite", "=", false);
  }

  if (group) {
    const isFavoriteGroup = group === "favorite";
    const isLinksGroup = group === "links";
    const isColorsGroup = group === "colors";
    const isEmailGroup = group === "email";
    const isCodeGroup = group === "code";
    const isNormalGroup =
      group !== "all" &&
      !isFavoriteGroup &&
      !isLinksGroup &&
      !isColorsGroup &&
      !isEmailGroup &&
      !isCodeGroup;

    if (isFavoriteGroup) {
      qb = qb.where("favorite", "=", true);
      // isFavoriteGroup 优先：跳过后续 group 分支避免误入 isNormalGroup
    } else if (isLinksGroup) {
      qb = qb.where("subtype", "in", ["url", "path"]);
    } else if (isColorsGroup) {
      qb = qb.where("subtype", "=", "color");
    } else if (isEmailGroup) {
      qb = qb.where("subtype", "=", "email");
    } else if (isCodeGroup) {
      qb = qb.where("subtype", "like", "code_%");
    } else if (isNormalGroup) {
      qb = qb.where("group", "=", group);
    }
  }

  if (search && search.trim()) {
    qb = qb.where((eb) =>
      eb.or([
        eb("search", "like", `%${search}%`),
        eb("note", "like", `%${search}%`),
      ]),
    );
  }

  if (offset !== undefined) {
    qb = qb.offset(offset);
  }
  if (limit !== undefined) {
    qb = qb.limit(limit);
  }

  qb = qb.orderBy("createTime", "desc");

  return qb.execute() as Promise<DatabaseSchemaHistory[]>;
};

export const countHistory = async (where?: { favorite?: boolean }) => {
  const db = await getDatabase();
  const { favorite } = where ?? {};

  let qb = db
    .selectFrom("history")
    .select(db.fn.countAll<number>().as("count"));

  if (favorite !== undefined) {
    qb = qb.where("favorite", "=", favorite);
  }

  const row = await qb.executeTakeFirst();

  return Number(row?.count ?? 0);
};

export const aggregateHistoryByType = async (
  params?: AggregateHistoryParams,
) => {
  const db = await getDatabase();
  const { dateRange, favorite } = params ?? {};

  let qb = db
    .selectFrom("history")
    .select([
      "type",
      "subtype",
      db.fn.count<number>("id").as("count"),
      db.fn.sum<number>("value_size").as("totalSize"),
    ]);

  if (dateRange) {
    qb = qb.where((eb) =>
      eb.and([
        eb("createTime", ">=", dateRange[0]),
        eb("createTime", "<=", dateRange[1]),
      ]),
    );
  }

  if (favorite === true) {
    qb = qb.where("favorite", "=", true);
  } else if (favorite === false) {
    qb = qb.where("favorite", "=", false);
  }

  const rows = await qb.groupBy(["type", "subtype"]).execute();

  return rows as unknown as AggregateRow[];
};

// ─── 删除（含文件清理） ───

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

export const cleanHistoryByType = async (params: {
  tagKey: string;
  scope: "all" | "favorites";
  dateRange?: [string, string] | null;
  deleteLocalFile: boolean;
}) => {
  const db = await getDatabase();

  if (params.deleteLocalFile && params.tagKey === "image") {
    const images = await db
      .selectFrom("history")
      .select(historyColumns as (keyof DatabaseSchemaHistory)[])
      .where("favorite", "=", params.scope === "favorites")
      .where((eb) => {
        const cond = getTypeDbCondition(params.tagKey, eb as any);
        return cond || eb("id", "is not", null);
      })
      .$if(!!params.dateRange, (qb) =>
        qb.where((eb) =>
          eb.and([
            eb("createTime", ">=", params.dateRange![0]),
            eb("createTime", "<=", params.dateRange![1]),
          ]),
        ),
      )
      .execute();

    const saveImagePath = getSaveImagePath();
    for (const item of images) {
      if (item.type !== "image" || !item.value) continue;
      const raw =
        typeof item.value === "string"
          ? item.value
          : Array.isArray(item.value)
            ? (item.value as string[]).filter(Boolean)[0]
            : null;
      if (!raw) continue;
      const resolvedPath =
        raw.startsWith(saveImagePath) ||
        /^[a-zA-Z]:[\\/]/.test(raw) ||
        raw.startsWith("/")
          ? raw
          : join(saveImagePath, raw);
      try {
        if (await exists(resolvedPath)) {
          await remove(resolvedPath);
        }
      } catch {
        // 单个文件删除失败不影响其他
      }
    }
  }

  let qb = db
    .deleteFrom("history")
    .where("favorite", "=", params.scope === "favorites");

  qb = qb.where((eb: any) => {
    const cond = getTypeDbCondition(params.tagKey, eb);
    return cond || eb("id", "is not", null);
  }) as any;

  if (params.dateRange) {
    qb = qb.where((eb) =>
      eb.and([
        eb("createTime", ">=", params.dateRange![0]),
        eb("createTime", "<=", params.dateRange![1]),
      ]),
    ) as any;
  }

  return qb.execute();
};

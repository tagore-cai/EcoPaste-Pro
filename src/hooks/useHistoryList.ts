import { exists } from "@tauri-apps/plugin-fs";
import { useAsyncEffect, useReactive } from "ahooks";
import { isString } from "es-toolkit";
import { unionBy } from "es-toolkit/compat";
import { useContext, useRef } from "react";
import { LISTEN_KEY } from "@/constants";
import { listHistory } from "@/database/history";
import { MainContext } from "@/pages/Main";
import { getSaveImagePath, join } from "@/utils/path";
import { useTauriListen } from "./useTauriListen";

interface Options {
  scrollToTop: () => void;
}

export const useHistoryList = (options: Options) => {
  const { scrollToTop } = options;
  const { rootState } = useContext(MainContext);
  const state = useReactive({
    loading: false,
    noMore: false,
    page: 1,
    size: 20,
  });
  const fetchIdRef = useRef(0);

  const fetchData = async (isReload = false) => {
    if (!isReload && state.loading) return;

    const currentFetchId = ++fetchIdRef.current;

    try {
      state.loading = true;

      const { page } = state;

      const { size } = state;
      const { group, search, dateRange, filterTags } = rootState;

      const list = await listHistory({
        dateRange,
        filterTags,
        group,
        limit: size,
        offset: (page - 1) * size,
        search,
      });

      if (currentFetchId !== fetchIdRef.current) return;

      for (const item of list) {
        const { type, value } = item;

        if (!isString(value)) continue;

        if (type === "image") {
          const { getDefaultSaveImagePath } = await import(
            "tauri-plugin-clipboard-x-api"
          );
          const defaultPath = join(await getDefaultSaveImagePath(), value);
          const customPath = join(getSaveImagePath(), value);

          item.value = (await exists(customPath)) ? customPath : defaultPath;
        }

        if (type === "files") {
          try {
            item.value = JSON.parse(value);
          } catch {
            item.value = [];
          }
        }
      }

      state.noMore = list.length < state.size;

      if (page === 1) {
        rootState.list = list;

        if (state.noMore) return;

        return scrollToTop();
      }

      rootState.list = unionBy(rootState.list, list, "id");
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        state.loading = false;
      }
    }
  };

  const reload = () => {
    state.page = 1;
    state.noMore = false;

    return fetchData(true);
  };

  const loadMore = () => {
    if (state.noMore || state.loading) return;

    state.page += 1;

    fetchData(false);
  };

  useTauriListen(LISTEN_KEY.REFRESH_CLIPBOARD_LIST, reload);
  useTauriListen(LISTEN_KEY.TRANSFER_LIST_UPDATED, reload);

  useAsyncEffect(async () => {
    await reload();

    rootState.activeId = rootState.list[0]?.id;
  }, [
    rootState.group,
    rootState.search,
    rootState.dateRange,
    rootState.filterTags,
  ]);

  return {
    loadMore,
    reload,
  };
};

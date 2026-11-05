import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Static, TSchema } from "typebox";
import { Check, Errors } from "typebox/value";
import type { MapDocument, MapFeature, MapReply } from "./map.ts";
import { validateMap } from "./map.ts";
import { describeMapProposal, stageMapChanges, validateMapSources } from "./map-protocol.ts";
import { mapToolSchemas } from "./map-tool-schema.ts";

export interface MapStoryReader {
  readonly memoryIds: Set<string>;
  directory(): Promise<unknown>;
  records(table: string, limit: number, offset: number): Promise<unknown>;
  summary(): Promise<unknown>;
}

type Patch = Extract<MapReply, { type: "proposal" }>;

function defineTool<S extends TSchema>(
  name: string,
  label: string,
  description: string,
  parameters: S,
  execute: (args: Static<S>) => unknown | Promise<unknown>,
  signal: AbortSignal,
): AgentTool<S> {
  return {
    name,
    label,
    description,
    parameters,
    prepareArguments(args) {
      if (!Check(parameters, args)) {
        const issues = Errors(parameters, args);
        const messages = issues
          .slice(0, 6)
          .map((issue) => `${issue.instancePath || "/"} ${issue.message}`);
        if (issues.length > messages.length) {
          messages.push(`另有 ${issues.length - messages.length} 处错误`);
        }
        throw new Error(`参数不符合工具结构：${name}\n${messages.join("\n")}`);
      }
      return args;
    },
    async execute(_id, args) {
      signal.throwIfAborted();
      let result;
      try {
        let abort: (() => void) | undefined;
        try {
          const cancelled = new Promise<never>((_resolve, reject) => {
            abort = () => reject(signal.reason);
            signal.addEventListener("abort", abort, { once: true });
          });
          const value = await Promise.race([execute(args), cancelled]);
          signal.throwIfAborted();
          result = { ok: true, value };
        } finally {
          if (abort) {
            signal.removeEventListener("abort", abort);
          }
        }
      } catch (error) {
        signal.throwIfAborted();
        result = {
          ok: false,
          error: { code: name + "_failed", message: (error as Error).message },
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  };
}

/** 仅检查本轮改过的轮廓和控制点，旧地图仍能读写。 */
function checkChangedGeometry(feature: MapFeature): void {
  const points = feature.geometry;
  if (!points || feature.kind === "place") {
    return;
  }
  const area = points.reduce((sum, [x, y], i) => {
    const [nextX, nextY] = points[(i + 1) % points.length]!;
    return sum + x * nextY - y * nextX;
  }, 0);
  if (feature.kind === "region" && area === 0) {
    throw new Error(`区域轮廓没有面积：${feature.id}`);
  }
  if (
    feature.kind === "road" &&
    points.every(([x, y]) => x === points[0]![0] && y === points[0]![1])
  ) {
    throw new Error(`道路没有有效长度：${feature.id}`);
  }
}

export function createMapTools(
  saved: MapDocument,
  initial: MapDocument,
  signal: AbortSignal,
  story?: MapStoryReader,
) {
  let draft = initial;
  let changed = false;
  let checked = false;
  const originalIdentities = new Map(
    initial.features.map((feature) => [feature.id, feature.memoryId]),
  );
  const tools = [
    defineTool(
      "map_read",
      "读取地图",
      "读取当前任务草稿。可按 id、名称或别名筛选。",
      mapToolSchemas.read,
      ({ query }) => {
        const key = query?.toLowerCase();
        return key
          ? {
              ...draft,
              features: draft.features.filter((f) =>
                [f.id, f.name, ...f.aliases].some((s) => s.toLowerCase().includes(key)),
              ),
            }
          : draft;
      },
      signal,
    ),
    defineTool(
      "map_apply",
      "修改草稿",
      "提交增量修改。允许暂时悬空引用以便后续修正。成功后必须重新检查。",
      mapToolSchemas.apply,
      (args) => {
        const patch = { type: "proposal", summary: "", ...args } as Patch;
        validateMapSources(patch, initial, story?.memoryIds);
        for (const feature of patch.upsert) {
          const originalId = originalIdentities.get(feature.id);
          if (originalId && originalId !== feature.memoryId) {
            throw new Error(`地点稳定资料身份冲突：${feature.name}`);
          }
        }
        const next = stageMapChanges(saved, draft, patch);
        draft = next;
        changed = true;
        checked = false;
        return { affectedIds: [...patch.upsert.map((f) => f.id), ...patch.remove] };
      },
      signal,
    ),
    defineTool(
      "map_check",
      "检查草稿",
      "检查要素、区域归属、事件、道路引用和本轮几何。失败后根据错误修正。",
      mapToolSchemas.empty,
      () => {
        checked = false;
        validateMap(draft);
        const before = new Map(initial.features.map((f) => [f.id, f.geometry]));
        for (const feature of draft.features) {
          if (JSON.stringify(before.get(feature.id)) !== JSON.stringify(feature.geometry)) {
            checkChangedGeometry(feature);
          }
        }
        checked = true;
        return { valid: true };
      },
      signal,
    ),
  ];
  return {
    tools: story
      ? [
          ...tools,
          defineTool(
            "map_story_directory",
            "查看资料目录",
            "列出用户授权的表及字段，只返回目录。",
            mapToolSchemas.empty,
            () => story.directory(),
            signal,
          ),
          defineTool(
            "map_story_records",
            "读取剧情记录",
            "分页读取授权表中的记录。",
            mapToolSchemas.records,
            ({ table, limit, offset }) => story.records(table, limit, offset),
            signal,
          ),
          defineTool(
            "map_story_summary",
            "读取剧情总结",
            "按需读取当前剧情总结。",
            mapToolSchemas.empty,
            () => story.summary(),
            signal,
          ),
        ]
      : tools,
    get changed() {
      return changed;
    },
    proposal(summary: string) {
      if (!changed || !checked) {
        throw new Error("地图修改未完成草稿检查，未形成提案");
      }
      return describeMapProposal(saved, draft, summary);
    },
  };
}

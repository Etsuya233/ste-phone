import type { MapSnapshot } from "../map.ts";
import type { MapService } from "../map-service.ts";

/** The chosen source tables are explicit; no custom location schema is silently skipped. */
export function MapStoryTables({ service, state }: { service: MapService; state: MapSnapshot }) {
  return (
    <details className="map-story-tables">
      <summary>
        剧情资料范围 · {state.storyTables.filter((table) => table.selected).length} 张表
      </summary>
      <p>读取所选资料表，另附剧情总结。</p>
      <div>
        {state.storyTables.map((table) => (
          <label key={table.name}>
            <input
              type="checkbox"
              checked={table.selected}
              disabled={state.status !== "idle"}
              onChange={(event) =>
                service.setStoryTables(
                  state.storyTables
                    .filter((entry) =>
                      entry.name === table.name ? event.target.checked : entry.selected,
                    )
                    .map((entry) => entry.name),
                )
              }
            />
            <span>
              {table.description || table.name}
              <small>{table.name}</small>
            </span>
          </label>
        ))}
      </div>
    </details>
  );
}

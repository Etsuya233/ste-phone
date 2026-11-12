import type { AiTransport } from "../../core/ai/public.ts";
import type { DataAppPublic } from "../data-source/public.ts";
import type { ModelConnectionsReader } from "../settings/public.ts";
import { generateNoteText } from "./notes-generation.ts";
import {
  noteHasContent,
  noteRoleKey,
  readNotesData,
  type NoteEntry,
  type NotesBlock,
  type NotesData,
  type NotesRole,
  type NotesStorage,
} from "./notes.ts";

const emptyNotes: NotesData = { version: 1, lastRole: null, entries: [] };

export interface NotesSnapshot {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly data: NotesData;
  readonly saving: boolean;
  readonly error: string | null;
}

interface NotesDependencies {
  readonly storage: NotesStorage;
  readonly data: DataAppPublic;
  readonly connections: ModelConnectionsReader;
  readonly transport: AiTransport;
}

export class NotesService {
  private snapshot: NotesSnapshot = {
    status: "idle",
    data: emptyNotes,
    saving: false,
    error: null,
  };
  private readonly listeners = new Set<() => void>();
  private loadTask: Promise<void> | null = null;
  private readonly dependencies: NotesDependencies;

  constructor(dependencies: NotesDependencies) {
    this.dependencies = dependencies;
  }

  readonly getSnapshot = (): NotesSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async load(): Promise<void> {
    if (this.snapshot.status === "ready") {
      return;
    }
    if (!this.loadTask) {
      // Publish loading after assigning the shared task, so subscribers can request the same load.
      this.loadTask = Promise.resolve().then(async () => {
        this.publish({ status: "loading", error: null });
        try {
          const stored = await this.dependencies.storage.read();
          this.publish({
            status: "ready",
            data: stored === null ? emptyNotes : readNotesData(stored),
          });
        } catch (error) {
          this.publish({
            status: "error",
            error: String(error instanceof Error ? error.message : error),
          });
        } finally {
          this.loadTask = null;
        }
      });
    }
    await this.loadTask;
  }

  async readRoles(): Promise<{ roles: readonly NotesRole[]; error: string | null }> {
    const data = this.dependencies.data;
    const { context } = data.getSnapshot();
    let currentRoles: NotesRole[] = [];
    let error: string | null = null;
    try {
      const { chatIdentity, scopeId } = context;
      if (!context.available || !chatIdentity || !scopeId) {
        throw new Error(context.message ?? "当前 Memory 资料不可用");
      }
      const scope = { chatIdentity, scopeId };
      const schema = await data.describe(scope);
      const characters = await data.readCharacters(scope);
      currentRoles = characters.map(({ id, name }) => ({
        sourceId: schema.sourceId,
        scopeId: schema.stableScopeId,
        id,
        name,
      }));
    } catch (cause) {
      error = String(cause instanceof Error ? cause.message : cause);
    }

    // Saved identities are still selectable if Memory is unavailable; live names take precedence.
    const { entries, lastRole } = this.snapshot.data;
    const roles = new Map(entries.map(({ role }) => [noteRoleKey(role), role]));
    if (lastRole) {
      roles.set(noteRoleKey(lastRole), lastRole);
    }
    for (const role of currentRoles) {
      roles.set(noteRoleKey(role), role);
    }
    return {
      roles: [...roles.values()].sort(
        (a, b) =>
          a.name.localeCompare(b.name, "zh-Hans-CN") ||
          noteRoleKey(a).localeCompare(noteRoleKey(b)),
      ),
      error,
    };
  }

  async selectRole(role: NotesRole): Promise<void> {
    const { data } = this.snapshot;
    if (
      data.lastRole &&
      noteRoleKey(data.lastRole) === noteRoleKey(role) &&
      data.lastRole.name === role.name
    ) {
      return;
    }
    await this.commit({ ...data, lastRole: role });
  }

  async saveNote(input: {
    id: string;
    role: NotesRole;
    blocks: readonly NotesBlock[];
  }): Promise<void> {
    if (!noteHasContent(input.blocks)) {
      throw new Error("请添加文字或图片，或使用删除操作");
    }
    const { data } = this.snapshot;
    const previous = data.entries.find((entry) => entry.id === input.id);
    if (previous && noteRoleKey(previous.role) !== noteRoleKey(input.role)) {
      throw new Error("无法更改备忘录所属角色");
    }
    const now = new Date().toISOString();
    const entry: NoteEntry = {
      id: input.id,
      role: input.role,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      blocks: input.blocks,
    };
    const entries = previous
      ? data.entries.map((item) => (item.id === entry.id ? entry : item))
      : [...data.entries, entry];
    await this.commit({ ...data, entries });
  }

  async deleteNote(id: string): Promise<void> {
    const { data } = this.snapshot;
    if (!data.entries.some((entry) => entry.id === id)) {
      throw new Error("要删除的备忘录不存在");
    }
    await this.commit({ ...data, entries: data.entries.filter((entry) => entry.id !== id) });
  }

  generate(
    instruction: string,
    signal: AbortSignal,
    onText: (text: string) => void,
  ): Promise<string> {
    return generateNoteText(
      this.dependencies.connections,
      this.dependencies.transport,
      instruction,
      signal,
      onText,
    );
  }

  private async commit(data: NotesData): Promise<void> {
    if (this.snapshot.status !== "ready") {
      throw new Error("请先读取已保存的备忘录");
    }
    if (this.snapshot.saving) {
      throw new Error("正在保存备忘录，请等待保存完成");
    }
    const saved = readNotesData(structuredClone(data));
    this.publish({ saving: true });
    try {
      // Storage confirms the entire account file before readers can see the new state.
      await this.dependencies.storage.write(saved);
      this.publish({ data: saved, saving: false });
    } catch (error) {
      this.publish({ saving: false });
      throw error;
    }
  }

  private publish(patch: Partial<NotesSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

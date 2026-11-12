import { useState } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import type { Navigation } from "../../../frontend/foundation/navigation-stack.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import {
  createNoteId,
  noteRoleKey,
  noteSummary,
  noteTitle,
  type NoteEntry,
  type NotesRole,
} from "../notes.ts";
import type { NotesRoute } from "./notes-app.tsx";
import {
  NotesChevronIcon,
  NotesPenIcon,
  NotesPlusIcon,
  NotesSearchIcon,
  NotesSparkleIcon,
} from "./notes-icons.tsx";
import { NotesRoleAvatar } from "./notes-role-avatar.tsx";

/** Recent notes read faster with a relative day; older notes keep an explicit calendar date. */
function formatNoteDate(value: string): string {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `今天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return "昨天";
  }
  return date.toLocaleDateString("zh-CN", {
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    month: "long",
    day: "numeric",
  });
}

export function NotesLoadPage({
  error,
  onHome,
  onRetry,
}: {
  error: string | null;
  onHome: () => void;
  onRetry: () => void;
}) {
  return (
    <Page
      className="notes-page notes-load-page"
      navBar={<NavBar title="备忘录" back={{ label: "主屏幕", onClick: onHome }} />}
    >
      <div className="notes-load-state">
        <span className="notes-load-mark" aria-hidden="true">
          <NotesPenIcon />
        </span>
        <p className="notes-message" role={error ? "alert" : "status"}>
          {error ?? "正在读取备忘录…"}
        </p>
        {error ? <Button onClick={onRetry}>重试</Button> : null}
      </div>
    </Page>
  );
}

export function NotesListPage({
  role,
  entries,
  navigation,
  onHome,
}: {
  role: NotesRole;
  entries: readonly NoteEntry[];
  navigation: Navigation<NotesRoute>;
  onHome: () => void;
}) {
  const [query, setQuery] = useState("");
  const roleKey = noteRoleKey(role);
  const search = query.trim().toLocaleLowerCase();
  const visibleEntries = entries
    .filter((entry) => noteRoleKey(entry.role) === roleKey)
    .filter(
      (entry) =>
        !search ||
        noteTitle(entry.blocks).toLocaleLowerCase().includes(search) ||
        entry.blocks.some(
          (block) => block.type === "paragraph" && block.text.toLocaleLowerCase().includes(search),
        ),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  function createNote() {
    navigation.push({
      page: "edit",
      draft: { id: createNoteId(), role, blocks: [], persisted: false },
    });
  }

  return (
    <Page
      className="notes-page notes-list-page"
      navBar={<NavBar back={{ label: "主屏幕", onClick: onHome }} />}
      footer={
        <NotesListFooter
          count={visibleEntries.length}
          onCreate={createNote}
          onAiCreate={() => navigation.push({ page: "ai-new", role })}
        />
      }
      footerHeight={56}
    >
      <header className="notes-masthead">
        <div className="notes-masthead-row">
          <h1 className="notes-display">备忘录</h1>
          <Button
            className="notes-role-pill"
            onClick={() => navigation.push({ page: "roles" })}
            aria-label={`切换角色，当前为${role.name}`}
          >
            <NotesRoleAvatar name={role.name} />
            <span>{role.name}</span>
            <NotesChevronIcon className="notes-role-chevron" />
          </Button>
        </div>
      </header>
      <div className="notes-search">
        <NotesSearchIcon className="notes-search-icon" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索备忘录"
          aria-label="搜索备忘录"
        />
      </div>
      {visibleEntries.length ? (
        <ul className="notes-entry-list" aria-label="备忘录列表">
          {visibleEntries.map((entry) => (
            <NotesEntryRow
              key={entry.id}
              entry={entry}
              onOpen={() => navigation.push({ page: "edit", draft: { ...entry, persisted: true } })}
            />
          ))}
        </ul>
      ) : (
        <NotesEmptyState searching={Boolean(search)} />
      )}
    </Page>
  );
}

function NotesListFooter({
  count,
  onCreate,
  onAiCreate,
}: {
  count: number;
  onCreate: () => void;
  onAiCreate: () => void;
}) {
  return (
    <div className="notes-list-footer">
      <span className="notes-list-total">{count} 条</span>
      <div className="notes-footer-actions" role="group" aria-label="新建备忘录">
        <Button className="notes-footer-ai" onClick={onAiCreate}>
          <NotesSparkleIcon />
          AI 新建
        </Button>
        <Button className="notes-footer-create" onClick={onCreate}>
          <NotesPlusIcon />
          新建
        </Button>
      </div>
    </div>
  );
}

function NotesEntryRow({ entry, onOpen }: { entry: NoteEntry; onOpen: () => void }) {
  const title = noteTitle(entry.blocks);
  const summary = noteSummary(entry.blocks);
  const imageCount = entry.blocks.filter((block) => block.type === "image").length;
  return (
    <li>
      <button type="button" className="notes-entry" onClick={onOpen}>
        <span className="notes-entry-copy">
          <span className="notes-entry-title">{title}</span>
          {summary ? <span className="notes-entry-summary">{summary}</span> : null}
          <span className="notes-entry-meta">
            <time dateTime={entry.updatedAt}>{formatNoteDate(entry.updatedAt)}</time>
            {imageCount ? <span className="notes-entry-tag">{imageCount} 张图片</span> : null}
          </span>
        </span>
        <NotesChevronIcon className="notes-entry-chevron" />
      </button>
    </li>
  );
}

function NotesEmptyState({ searching }: { searching: boolean }) {
  return (
    <div className="notes-empty" role="status">
      <span className="notes-empty-mark" aria-hidden="true">
        {searching ? <NotesSearchIcon /> : <NotesPenIcon />}
      </span>
      <h2>{searching ? "没有找到备忘录" : "还没有备忘录"}</h2>
      <p>
        {searching ? "换个关键词，或切换到其他角色看看。" : "写下一点想法，或者让 AI 先起个草。"}
      </p>
    </div>
  );
}

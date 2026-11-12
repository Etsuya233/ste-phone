import { useEffect, useState } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import type { NotesService, NotesSnapshot } from "../notes-service.ts";
import { noteRoleKey, type NotesRole } from "../notes.ts";
import { NotesChevronIcon } from "./notes-icons.tsx";
import { NotesRoleAvatar } from "./notes-role-avatar.tsx";

export function NotesRolesPage({
  notes,
  snapshot,
  current,
  onBack,
  onSelected,
}: {
  notes: NotesService;
  snapshot: NotesSnapshot;
  current: boolean;
  onBack: () => void;
  onSelected?: () => void;
}) {
  const [result, setResult] = useState<Awaited<ReturnType<NotesService["readRoles"]>> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [chosen, setChosen] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!current) {
      return;
    }
    let disposed = false;
    void notes.readRoles().then((roles) => {
      if (!disposed) {
        setResult(roles);
      }
    });
    return () => {
      disposed = true;
    };
  }, [current, notes, retry]);
  useEffect(() => {
    if (current && chosen) {
      onSelected?.();
    }
  }, [current, chosen, onSelected]);

  async function choose(role: NotesRole) {
    setSaveError(null);
    try {
      await notes.selectRole(role);
      setChosen(true);
    } catch (error) {
      setSaveError((error as Error).message);
    }
  }

  const currentRole = snapshot.data.lastRole ? noteRoleKey(snapshot.data.lastRole) : null;
  const roleNames = new Set<string>();
  const duplicateNames = new Set<string>();
  for (const role of result?.roles ?? []) {
    if (roleNames.has(role.name)) {
      duplicateNames.add(role.name);
    }
    roleNames.add(role.name);
  }

  return (
    <Page
      className="notes-page notes-roles-page"
      navBar={
        <NavBar
          back={
            snapshot.saving
              ? undefined
              : { label: onSelected ? "备忘录" : "主屏幕", onClick: onBack }
          }
        />
      }
    >
      <header className="notes-roles-intro">
        <h1 className="notes-display">选择角色</h1>
      </header>
      {saveError ? (
        <p className="notes-notice notes-notice--error" role="alert">
          {saveError}
        </p>
      ) : null}
      {result?.error ? (
        <div className="notes-notice" role="status">
          <p>{result.error}</p>
          <Button
            disabled={snapshot.saving}
            onClick={() => {
              setResult(null);
              setRetry((value) => value + 1);
            }}
          >
            重试读取角色
          </Button>
        </div>
      ) : null}
      {!result ? (
        <p className="notes-message" role="status">
          正在读取角色…
        </p>
      ) : null}
      {result?.roles.length ? (
        <ul className="notes-role-list" aria-label="角色列表">
          {result.roles.map((role) => {
            const key = noteRoleKey(role);
            return (
              <li key={key}>
                <NotesRoleRow
                  role={role}
                  noteCount={
                    snapshot.data.entries.filter((entry) => noteRoleKey(entry.role) === key).length
                  }
                  current={key === currentRole}
                  duplicate={duplicateNames.has(role.name)}
                  disabled={snapshot.saving || chosen}
                  onChoose={() => void choose(role)}
                />
              </li>
            );
          })}
        </ul>
      ) : result && !result.error ? (
        <p className="notes-message" role="status">
          暂无可选角色
        </p>
      ) : null}
    </Page>
  );
}

function NotesRoleRow({
  role,
  noteCount,
  current,
  duplicate,
  disabled,
  onChoose,
}: {
  role: NotesRole;
  noteCount: number;
  current: boolean;
  duplicate: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      className="notes-role-row"
      disabled={disabled}
      aria-current={current ? "true" : undefined}
      onClick={onChoose}
    >
      <NotesRoleAvatar name={role.name} />
      <span className="notes-role-copy">
        <span className="notes-role-name">{role.name}</span>
        <span className="notes-role-meta">
          {noteCount ? `${noteCount} 条备忘` : "暂无备忘"}
          {duplicate ? ` · ${role.scopeId} · ${role.id}` : ""}
        </span>
      </span>
      {current ? (
        <span className="notes-role-current">当前</span>
      ) : (
        <NotesChevronIcon className="notes-role-chevron" />
      )}
    </button>
  );
}

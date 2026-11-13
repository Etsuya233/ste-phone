import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AppId } from "../../../core/launcher/catalog.ts";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import { GalleryContext } from "../../../frontend/images/gallery-context.ts";
import type { GalleryImageReference, GalleryPublic } from "../../gallery/public.ts";
import type { NotesService } from "../notes-service.ts";
import { createNoteId, noteRoleKey, textToNoteBlocks, type NotesRole } from "../notes.ts";
import { NotesEditPage, type NotesDraftStart } from "./notes-edit-page.tsx";
import { NotesImagePickerPage, NotesImageViewPage } from "./notes-images.tsx";
import { NotesListPage, NotesLoadPage } from "./notes-list.tsx";
import { NotesRolesPage } from "./notes-roles-page.tsx";
import { NotesAiNewPage } from "./notes-writing.tsx";

export type NotesRoute =
  | { page: "list" }
  | { page: "roles" }
  | { page: "edit"; draft: NotesDraftStart }
  | { page: "ai-new"; role: NotesRole }
  | { page: "pick-image"; onChoose: (image: GalleryImageReference) => void }
  | { page: "view-image"; image: GalleryImageReference };

export function NotesApp({
  active,
  notes,
  gallery,
  onHome,
  onOpen,
  quitGuard,
}: {
  active: boolean;
  notes: NotesService;
  gallery: GalleryPublic;
  onHome: () => void;
  onOpen: (app: AppId) => void;
  quitGuard: { request: () => boolean };
}) {
  const snapshot = useSyncExternalStore(notes.subscribe, notes.getSnapshot);
  const quitBlocked = useRef(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [stackVersion, setStackVersion] = useState(0);
  useEffect(() => {
    if (active && snapshot.status === "idle") {
      void notes.load();
    }
  }, [active, notes, snapshot.status]);

  useLayoutEffect(() => {
    quitGuard.request = () => {
      if (notes.getSnapshot().saving) {
        return false;
      }
      if (quitBlocked.current) {
        setConfirmQuit(true);
        return false;
      }
      return true;
    };
    return () => {
      quitGuard.request = () => true;
    };
  }, [notes, quitGuard]);

  return (
    <div className="notes-app">
      <div className="notes-stack" inert={confirmQuit}>
        <GalleryContext.Provider value={gallery}>
          <NavigationStack<NotesRoute>
            key={stackVersion}
            active={active && !confirmQuit}
            initialRoutes={[{ page: "list" }]}
          >
            {(route, navigation) => {
              const compose = { notes, gallery, navigation, onOpen, quitBlocked };
              switch (route.page) {
                case "list":
                  if (snapshot.status !== "ready") {
                    return (
                      <NotesLoadPage
                        error={snapshot.error}
                        onHome={onHome}
                        onRetry={() => void notes.load()}
                      />
                    );
                  }
                  if (!snapshot.data.lastRole) {
                    return (
                      <NotesRolesPage
                        notes={notes}
                        snapshot={snapshot}
                        current={navigation.current}
                        onBack={onHome}
                      />
                    );
                  }
                  return (
                    <NotesListPage
                      key={noteRoleKey(snapshot.data.lastRole)}
                      role={snapshot.data.lastRole}
                      entries={snapshot.data.entries}
                      navigation={navigation}
                      onHome={onHome}
                    />
                  );
                case "roles":
                  return (
                    <NotesRolesPage
                      notes={notes}
                      snapshot={snapshot}
                      current={navigation.current}
                      onBack={navigation.pop}
                      onSelected={navigation.pop}
                    />
                  );
                case "edit":
                  return <NotesEditPage {...compose} draft={route.draft} />;
                case "ai-new":
                  return <NotesAiComposePage {...compose} role={route.role} />;
                case "pick-image":
                  return (
                    <NotesImagePickerPage
                      gallery={gallery}
                      current={navigation.current}
                      onBack={navigation.pop}
                      onChoose={(image) => {
                        route.onChoose(image);
                        navigation.pop();
                      }}
                    />
                  );
                case "view-image":
                  return (
                    <NotesImageViewPage
                      gallery={gallery}
                      image={route.image}
                      onBack={navigation.pop}
                    />
                  );
              }
            }}
          </NavigationStack>
        </GalleryContext.Provider>
      </div>
      {confirmQuit ? (
        <Alert
          title="舍弃未保存的内容？"
          active={active}
          onDismiss={() => setConfirmQuit(false)}
          actions={[
            { label: "继续编辑", onClick: () => setConfirmQuit(false) },
            {
              label: "舍弃",
              onClick: () => {
                setStackVersion((version) => version + 1);
                setConfirmQuit(false);
              },
            },
          ]}
        >
          未保存的修改和未采用的 AI 文字会被舍弃。
        </Alert>
      ) : null}
    </div>
  );
}

function NotesAiComposePage({
  role,
  ...props
}: Omit<Parameters<typeof NotesEditPage>[0], "draft"> & { role: NotesRole }) {
  const [draft, setDraft] = useState<NotesDraftStart | null>(null);
  return draft ? (
    <NotesEditPage {...props} draft={draft} />
  ) : (
    <NotesAiNewPage
      notes={props.notes}
      role={role}
      current={props.navigation.current}
      onBack={props.navigation.pop}
      onOpen={props.onOpen}
      quitBlocked={props.quitBlocked}
      onAccept={(text) =>
        setDraft({ id: createNoteId(), role, blocks: textToNoteBlocks(text), persisted: false })
      }
    />
  );
}

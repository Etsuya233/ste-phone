import { useEffect, useState } from "react";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import {
  CAMPUS_MAX_IMAGES,
  createCampusId,
  createCampusPost,
  type CampusImage,
} from "../campus-domain.ts";
import { AccountAvatar } from "./campus-avatar.tsx";
import { PlusIcon } from "./campus-icons.tsx";
import { CampusImageEditor } from "./campus-image-editor.tsx";
import { CampusPage, type CampusPageProps } from "./campus-page.tsx";

export function CampusComposePage(props: CampusPageProps) {
  const { service, state, navigation } = props;
  const [text, setText] = useState("");
  const [images, setImages] = useState<{ key: string; value: CampusImage }[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [workingImage, setWorkingImage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [discard, setDiscard] = useState(false);
  const authorId = state.data.activeAccountId;
  const author = state.data.accounts.find(({ id }) => id === authorId);
  const busy = saved || state.phase !== "idle";
  const missingIndex = images.findIndex(({ value }) => !value.description.trim() && !value.image);
  const canPublish = Boolean(author && (text.trim() || images.length) && missingIndex === -1);
  const scope = state.scopeKey;
  const editing = images.find(({ key }) => key === editingKey);

  useEffect(() => {
    if (saved && navigation.current) {
      navigation.pop();
    }
  }, [saved, navigation]);

  function back() {
    if (saved) {
      navigation.pop();
      return;
    }
    const hasContent =
      Boolean(text.trim()) ||
      images.some(
        ({ value }) =>
          Boolean(value.description.trim() || value.prompt?.trim()) || Boolean(value.image),
      );
    if (hasContent) {
      setDiscard(true);
    } else {
      navigation.pop();
    }
  }

  async function publish() {
    if (!authorId || !canPublish || busy || workingImage) {
      return;
    }
    const post = createCampusPost({
      id: createCampusId(),
      authorId,
      text: text.trim(),
      images: images.map(({ value }) => ({
        ...value,
        description: value.description.trim(),
        prompt: value.prompt?.trim(),
      })),
      backgroundLikes: 0,
      backgroundComments: 0,
    });
    setSaved(await service.command({ type: "publish", post }));
  }

  function addImage() {
    const key = createCampusId();
    setImages((previous) => [...previous, { key, value: { description: "" } }]);
    setEditingKey(key);
  }

  function removeImage(key: string) {
    setImages((previous) => previous.filter((item) => item.key !== key));
    setEditingKey(null);
  }

  function moveImage(key: string, direction: number) {
    setImages((previous) => {
      const index = previous.findIndex((item) => item.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= previous.length) {
        return previous;
      }
      const next = [...previous];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  return (
    <>
      <div inert={discard}>
        <CampusPage
          {...props}
          title="新帖子"
          back={back}
          right={
            <Button
              className="campus-nav-publish"
              variant="filled"
              type="submit"
              form="campus-compose-form"
              disabled={!canPublish || busy || Boolean(workingImage)}
            >
              发布
            </Button>
          }
        >
          <form
            id="campus-compose-form"
            className="campus-form campus-compose"
            onSubmit={(event) => {
              event.preventDefault();
              void publish();
            }}
          >
            {author ? (
              <div className="campus-compose-author">
                <AccountAvatar account={author} size="small" />
                <span>以 {author.nickname} 发布</span>
              </div>
            ) : (
              <div className="campus-section campus-welcome">
                <p>还没有选择操作账号。</p>
                <Button onClick={() => navigation.push({ page: "switch-account" })}>
                  选择账号
                </Button>
              </div>
            )}
            <label>
              正文
              <textarea
                rows={5}
                value={text}
                disabled={busy}
                onChange={(event) => setText(event.target.value)}
                placeholder="有什么新鲜事？"
              />
            </label>
            <div className="campus-compose-media" aria-label="配图">
              {images.map(({ key, value }, index) => {
                const missing = !value.description.trim() && !value.image;
                return (
                  <button
                    type="button"
                    key={key}
                    className={`campus-compose-tile${missing ? " campus-compose-tile--missing" : ""}${editingKey === key ? " campus-compose-tile--editing" : ""}`}
                    aria-label={`编辑第 ${index + 1} 张配图${missing ? "，缺少描述" : ""}`}
                    disabled={workingImage !== null && workingImage !== key}
                    onClick={() => setEditingKey(key)}
                  >
                    {value.image ? (
                      <img src={value.image.path} alt="" loading="lazy" />
                    ) : (
                      <span>{value.description || "待补充描述"}</span>
                    )}
                    <small className="campus-compose-index">{index + 1}</small>
                    {missing ? <small className="campus-compose-missing">!</small> : null}
                  </button>
                );
              })}
              {images.length < CAMPUS_MAX_IMAGES ? (
                <button
                  type="button"
                  className="campus-compose-add"
                  aria-label="添加配图"
                  disabled={busy || Boolean(workingImage)}
                  onClick={addImage}
                >
                  <PlusIcon />
                </button>
              ) : null}
            </div>
            {missingIndex >= 0 ? (
              <p className="campus-hint" role="status">
                第 {missingIndex + 1} 张配图还缺少描述，补完才能发布。
              </p>
            ) : !text.trim() && !images.length ? (
              <p className="campus-hint">正文和配图至少需要一项。</p>
            ) : null}
            {editing ? (
              <div className="campus-compose-editor">
                <p className="campus-meta">
                  第 {images.findIndex(({ key }) => key === editing.key) + 1} 张配图
                </p>
                <CampusImageEditor
                  image={editing.value}
                  hub={service.imageHub}
                  disabled={busy || (workingImage !== null && workingImage !== editing.key)}
                  onChange={(next) =>
                    setImages((previous) =>
                      previous.map((item) =>
                        item.key === editing.key ? { key: item.key, value: next } : item,
                      ),
                    )
                  }
                  onRemove={() => removeImage(editing.key)}
                  onWorking={(working) => setWorkingImage(working ? editing.key : null)}
                  stillOwned={() => {
                    const current = service.getSnapshot();
                    return current.scopeKey === scope && current.data.activeAccountId === authorId;
                  }}
                />
                <div className="campus-row campus-compose-move">
                  <Button
                    disabled={busy || images[0]?.key === editing.key}
                    onClick={() => moveImage(editing.key, -1)}
                  >
                    上移
                  </Button>
                  <Button
                    disabled={busy || images.at(-1)?.key === editing.key}
                    onClick={() => moveImage(editing.key, 1)}
                  >
                    下移
                  </Button>
                  <Button disabled={workingImage !== null} onClick={() => setEditingKey(null)}>
                    完成
                  </Button>
                </div>
              </div>
            ) : null}
          </form>
        </CampusPage>
      </div>
      {discard ? (
        <Alert
          title="舍弃这条帖子？"
          active={navigation.current}
          onDismiss={() => setDiscard(false)}
          actions={[
            { label: "继续编辑", onClick: () => setDiscard(false) },
            {
              label: "舍弃",
              primary: true,
              onClick: () => {
                setDiscard(false);
                navigation.pop();
              },
            },
          ]}
        >
          正文和配图还没有发布。
        </Alert>
      ) : null}
    </>
  );
}

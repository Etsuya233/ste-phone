import { useEffect, useState } from "react";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { CampusImage, CampusPost } from "../campus-domain.ts";
import { ArrowIcon } from "./campus-icons.tsx";
import { CampusImageEditor } from "./campus-image-editor.tsx";
import { CampusPage, type CampusPageProps } from "./campus-page.tsx";

export function CampusImagePage(props: CampusPageProps & { postId: string; index: number }) {
  const [index, setIndex] = useState(props.index);
  const post = props.state.data.posts.find(({ id }) => id === props.postId);
  const image = post?.images[index];
  useEffect(() => {
    if (post && !post.images[index] && post.images.length) {
      setIndex(Math.min(props.index, post.images.length - 1));
    }
  }, [index, post, props.index]);
  if (!post || !image) {
    return (
      <CampusPage {...props} title="配图" back={props.navigation.pop}>
        <p className="campus-section">配图已移除。</p>
      </CampusPage>
    );
  }
  return (
    <CampusPublishedImage {...props} post={post} image={image} index={index} onIndex={setIndex} />
  );
}

function CampusPublishedImage(
  props: CampusPageProps & {
    post: CampusPost;
    image: CampusImage;
    index: number;
    onIndex: (index: number) => void;
  },
) {
  const { service, state, navigation, post, image, index, onIndex } = props;
  const [draft, setDraft] = useState<CampusImage | null>(null);
  const [working, setWorking] = useState(false);
  const [discard, setDiscard] = useState(false);
  const busy = state.phase !== "idle";
  const scope = state.scopeKey;
  const account = state.data.activeAccountId;
  const count = post.images.length;

  useEffect(() => {
    if (!navigation.current || draft) {
      return;
    }
    const move = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      const next = index + (event.key === "ArrowLeft" ? -1 : 1);
      if (next >= 0 && next < count) {
        event.preventDefault();
        onIndex(next);
      }
    };
    window.addEventListener("keydown", move);
    return () => window.removeEventListener("keydown", move);
  }, [navigation.current, draft, index, count, onIndex]);

  async function save() {
    if (!draft || busy || working || (!draft.image && !draft.description.trim())) {
      return;
    }
    const next = { ...draft, description: draft.description.trim(), prompt: draft.prompt?.trim() };
    const saved = await service.command({ type: "image", postId: post.id, index, image: next });
    if (saved) {
      setDraft(null);
    }
  }

  function back() {
    if (draft) {
      setDiscard(true);
    } else {
      navigation.pop();
    }
  }

  return (
    <>
      <div inert={discard}>
        <CampusPage
          {...props}
          title="配图"
          back={back}
          right={
            !draft ? (
              <Button disabled={busy} onClick={() => setDraft(image)}>
                编辑
              </Button>
            ) : undefined
          }
        >
          {draft ? (
            <form
              className="campus-form"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <CampusImageEditor
                image={draft}
                hub={service.imageHub}
                disabled={busy}
                onChange={setDraft}
                onWorking={setWorking}
                stillOwned={() => {
                  const current = service.getSnapshot();
                  return current.scopeKey === scope && current.data.activeAccountId === account;
                }}
              />
              <Button
                type="submit"
                variant="filled"
                disabled={busy || working || (!draft.image && !draft.description.trim())}
              >
                保存配图
              </Button>
              <Button disabled={busy || working} onClick={() => setDraft(null)}>
                取消编辑
              </Button>
            </form>
          ) : (
            <>
              <figure className="campus-image-viewer">
                {image.image ? (
                  <img
                    className="campus-image-preview"
                    src={image.image.path}
                    alt={image.description}
                  />
                ) : (
                  <div className="campus-image-placeholder">
                    {image.description || image.prompt}
                  </div>
                )}
                <figcaption>
                  <span>{image.description}</span>
                  <small>
                    第 {index + 1} 张，共 {count} 张
                  </small>
                </figcaption>
              </figure>
              <div className="campus-image-nav">
                <Button disabled={index === 0} onClick={() => onIndex(index - 1)}>
                  <span className="campus-button-icon">
                    <ArrowIcon direction="left" />
                  </span>
                  上一张
                </Button>
                <Button disabled={index === count - 1} onClick={() => onIndex(index + 1)}>
                  下一张
                  <span className="campus-button-icon">
                    <ArrowIcon direction="right" />
                  </span>
                </Button>
              </div>
            </>
          )}
        </CampusPage>
      </div>
      {discard ? (
        <Alert
          title="舍弃配图修改？"
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
          尚未保存的配图资料会丢失。
        </Alert>
      ) : null}
    </>
  );
}

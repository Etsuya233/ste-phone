import { useState } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { CampusImage, CampusPost } from "../campus-domain.ts";
import { CampusImageEditor } from "./campus-image-editor.tsx";
import { CampusPage, type CampusPageProps } from "./campus-page.tsx";

export function CampusImagePage(props: CampusPageProps & { postId: string; index: number }) {
  const post = props.state.data.posts.find(({ id }) => id === props.postId);
  const image = post?.images[props.index];
  if (!post || !image) {
    return (
      <CampusPage {...props} title="配图" back={props.navigation.pop}>
        <p className="campus-section">配图已移除。</p>
      </CampusPage>
    );
  }
  return <CampusPublishedImage {...props} post={post} image={image} />;
}

function CampusPublishedImage(
  props: CampusPageProps & { post: CampusPost; image: CampusImage; index: number },
) {
  const { service, state, navigation, post, image, index } = props;
  const [draft, setDraft] = useState<CampusImage | null>(null);
  const [working, setWorking] = useState(false);
  const busy = state.phase !== "idle";
  const scope = state.scopeKey;
  const account = state.data.activeAccountId;

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

  return (
    <CampusPage
      {...props}
      title="配图"
      back={navigation.pop}
      right={
        !draft ? (
          <Button disabled={busy} onClick={() => setDraft(image)}>
            编辑配图
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
        <figure className="campus-profile">
          {image.image ? (
            <img className="campus-image-preview" src={image.image.path} alt={image.description} />
          ) : null}
          <figcaption>{image.description}</figcaption>
        </figure>
      )}
    </CampusPage>
  );
}

import { useEffect, useState } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";
import {
  CAMPUS_MAX_IMAGES,
  createCampusId,
  createCampusPost,
  type CampusImage,
} from "../campus-domain.ts";
import { CampusImageEditor } from "./campus-image-editor.tsx";
import { CampusPage, type CampusPageProps } from "./campus-page.tsx";

export function CampusComposePage(props: CampusPageProps) {
  const { service, state, navigation } = props;
  const [text, setText] = useState("");
  const [images, setImages] = useState<{ key: string; value: CampusImage }[]>([]);
  const [workingImage, setWorkingImage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const authorId = state.data.activeAccountId;
  const author = state.data.accounts.find(({ id }) => id === authorId);
  const busy = saved || state.phase !== "idle";
  const canPublish = Boolean(
    author &&
    (text.trim() || images.length) &&
    images.every(({ value }) => value.description.trim() || value.image),
  );
  const scope = state.scopeKey;

  useEffect(() => {
    if (saved && navigation.current) {
      navigation.pop();
    }
  }, [saved, navigation]);

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
      popular: false,
    });
    setSaved(await service.command({ type: "publish", post }));
  }

  return (
    <CampusPage {...props} title="发布帖子" back={navigation.pop}>
      <form
        className="campus-form"
        onSubmit={(event) => {
          event.preventDefault();
          void publish();
        }}
      >
        {author ? <p className="campus-meta">以 {author.nickname} 发布</p> : null}
        <label>
          正文
          <textarea
            rows={5}
            value={text}
            disabled={busy}
            onChange={(event) => setText(event.target.value)}
            placeholder="想和校园里的大家说点什么？"
          />
        </label>
        {images.map(({ key, value }, index) => (
          <fieldset key={key}>
            <legend>配图 {index + 1}</legend>
            <CampusImageEditor
              image={value}
              hub={service.imageHub}
              disabled={busy || (workingImage !== null && workingImage !== key)}
              onChange={(next) =>
                setImages((previous) =>
                  previous.map((item) => (item.key === key ? { key, value: next } : item)),
                )
              }
              onRemove={() => setImages((previous) => previous.filter((item) => item.key !== key))}
              onWorking={(working) => setWorkingImage(working ? key : null)}
              stillOwned={() => {
                const current = service.getSnapshot();
                return current.scopeKey === scope && current.data.activeAccountId === authorId;
              }}
            />
          </fieldset>
        ))}
        {images.length < CAMPUS_MAX_IMAGES ? (
          <Button
            disabled={busy || Boolean(workingImage)}
            onClick={() => {
              setImages((previous) => [
                ...previous,
                { key: createCampusId(), value: { description: "" } },
              ]);
            }}
          >
            添加配图
          </Button>
        ) : null}
        <Button
          type="submit"
          variant="filled"
          disabled={!canPublish || busy || Boolean(workingImage)}
        >
          确认发布
        </Button>
      </form>
    </CampusPage>
  );
}

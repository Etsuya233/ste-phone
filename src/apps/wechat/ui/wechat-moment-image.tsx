import { useGallery } from "../../../frontend/images/gallery-context.ts";
import { galleryImageKey } from "../../gallery/public.ts";
import { useEffect, useRef, useState } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import type { WechatPageProps } from "./wechat-page.tsx";
import type { MomentImage } from "../wechat-moments.ts";
import { momentWritingReason } from "./wechat-moment-content.tsx";

function useMomentImage({
  wechat,
  state,
  navigation,
  scopeId,
  id,
  index,
}: WechatPageProps & { scopeId: string; id: string; index: number; active: boolean }) {
  const moment = state.data.moments?.[scopeId]?.find((item) => item.id === id);
  const media = moment?.media[index];
  const image = media?.type === "image" ? media : undefined;
  const [prompt, setPrompt] = useState(image?.prompt ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const [saved, setSaved] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const reason = momentWritingReason(state, scopeId);
  const locked = busy || !!reason;
  const changed = prompt !== (image?.prompt ?? "");
  async function act(action: "save" | "refine" | "generate") {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      if (action === "save") {
        await wechat.moments.saveImagePrompt(id, index, prompt);
        if (mounted.current) {
          setPrompt(prompt.trim());
          setSaved(true);
        }
      }
      if (action === "refine") {
        const refined = await wechat.moments.refineImagePrompt(id, index, prompt);
        if (mounted.current) {
          setPrompt(refined);
        }
      }
      if (action === "generate") {
        // 生成按钮显式保存本次提示词，再提交绘图；发布动态时不自动生成。
        if (changed) {
          await wechat.moments.saveImagePrompt(id, index, prompt);
          if (mounted.current) {
            setPrompt(prompt.trim());
          }
        }
        if (mounted.current) {
          await wechat.moments.generateImage(id, index);
        }
      }
    } catch (cause) {
      if (mounted.current && (cause as Error).name !== "AbortError") {
        setError((cause as Error).message);
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
    }
  }
  function back() {
    if (changed) {
      setDiscard(true);
    } else {
      navigation.pop();
    }
  }
  return {
    image,
    saved,
    prompt,
    setPrompt,
    busy,
    error,
    discard,
    setDiscard,
    reason,
    locked,
    changed,
    act,
    back,
  };
}

export function WechatMomentImage(
  props: WechatPageProps & { scopeId: string; id: string; index: number; active: boolean },
) {
  const { wechat, navigation, id, index, active } = props;
  const {
    image,
    saved,
    prompt,
    setPrompt,
    busy,
    error,
    discard,
    setDiscard,
    reason,
    locked,
    changed,
    act,
    back,
  } = useMomentImage(props);
  return (
    <>
      <div className="wechat-moment-page" inert={discard}>
        <Page
          navBar={<NavBar title={`图片 ${index + 1}`} back={{ label: "动态", onClick: back }} />}
        >
          {image ? (
            <div className="wechat-moment-editor">
              <MomentImagePreview image={image} navigation={navigation} />
              {reason ? <p className="wechat-notice">{reason}</p> : null}
              <label className="wechat-moment-label">
                绘图提示词
                <textarea
                  rows={9}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  disabled={busy}
                  placeholder="描述人物、场景、构图、光线与画面风格…"
                />
              </label>
              <div className="wechat-moment-image-tools">
                <Button
                  disabled={locked || !changed || !prompt.trim()}
                  onClick={() => void act("save")}
                >
                  保存提示词
                </Button>
                <Button disabled={locked} onClick={() => void act("refine")}>
                  AI 完善提示词
                </Button>
                <Button
                  variant="filled"
                  className="wechat-moment-primary"
                  disabled={locked || !prompt.trim()}
                  onClick={() => void act("generate")}
                >
                  {busy ? "处理中…" : image.image ? "重新生成图片" : "生成图片"}
                </Button>
                <Button
                  disabled={locked}
                  onClick={() =>
                    navigation.push({
                      page: "moment-image-picker",
                      selectedKey: image.image ? galleryImageKey(image.image) : undefined,
                      onSelect: (selected) => wechat.moments.selectImage(id, index, selected),
                    })
                  }
                >
                  从图库选图
                </Button>
              </div>
              {saved && !changed ? (
                <p className="wechat-notice" role="status">
                  提示词已保存。
                </p>
              ) : null}
              {error ? (
                <p className="wechat-notice" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="wechat-notice">图片已删除。</p>
          )}
        </Page>
      </div>
      {discard ? (
        <Alert
          active={active}
          title="舍弃提示词修改？"
          onDismiss={() => setDiscard(false)}
          actions={[
            { label: "继续编辑", onClick: () => setDiscard(false) },
            { label: "舍弃", onClick: navigation.pop },
          ]}
        >
          未保存的提示词将被舍弃。
        </Alert>
      ) : null}
    </>
  );
}

export function WechatMomentImageView({
  navigation,
  imagePath,
  description,
}: Pick<WechatPageProps, "navigation"> & { imagePath: string; description: string }) {
  const { imageUrl } = useGallery();
  return (
    <Page navBar={<NavBar title="图片" back={{ label: "返回", onClick: navigation.pop }} />}>
      <figure className="wechat-moment-image-figure">
        <img className="wechat-moment-full-photo" src={imageUrl(imagePath)} alt={description} />
        <figcaption>{description}</figcaption>
      </figure>
    </Page>
  );
}

function MomentImagePreview({
  image,
  navigation,
}: { image: MomentImage } & Pick<WechatPageProps, "navigation">) {
  const { imageUrl } = useGallery();
  return image.image ? (
    <>
      <button
        type="button"
        className="wechat-moment-image-view"
        aria-label="查看大图"
        onClick={() =>
          navigation.push({
            page: "moment-image-view",
            imagePath: image.image!.imagePath,
            description: image.description,
          })
        }
      >
        <img
          className="wechat-moment-full-photo"
          src={imageUrl(image.image.imagePath)}
          alt={image.description}
        />
      </button>
      <p>{image.description}</p>
    </>
  ) : (
    <div className="wechat-moment-placeholder">
      <span>尚未配图</span>
      <p>{image.description}</p>
    </div>
  );
}

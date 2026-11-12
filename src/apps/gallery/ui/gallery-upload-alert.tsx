import type { CSSProperties } from "react";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import type { GalleryService, PhotoUploadState } from "../gallery-service.ts";

const phaseLabels = {
  validating: "正在检查照片…",
  uploading: "正在保存照片文件…",
  indexing: "正在保存照片信息…",
};

export function GalleryUploadAlert({
  gallery,
  state,
  active,
}: {
  gallery: GalleryService;
  state: Exclude<PhotoUploadState, { status: "idle" }>;
  active: boolean;
}) {
  const failed = state.status === "failed";
  const cancelling = state.status === "cancelling";
  const progress = state.completed / state.total;
  return (
    <Alert
      title={failed ? "照片上传结果" : "正在上传照片"}
      active={active}
      onDismiss={gallery.dismissUpload}
      actions={
        failed
          ? [
              { label: "重试失败项", onClick: () => void gallery.retryUpload() },
              { label: "完成", primary: true, onClick: gallery.dismissUpload },
            ]
          : [{ label: "取消上传", onClick: gallery.dismissUpload, disabled: cancelling }]
      }
    >
      <div
        className="gallery-upload-pie"
        aria-hidden="true"
        style={{ "--gallery-upload-turn": `${progress}turn` } as CSSProperties}
      />
      <p>
        已完成 {state.completed}/{state.total}
      </p>
      {failed ? (
        <>
          <p>{state.failures.length} 张上传失败</p>
          {state.total - state.completed - state.failures.length > 0 ? (
            <p>{state.total - state.completed - state.failures.length} 张已取消</p>
          ) : null}
          <ul className="gallery-upload-errors">
            {state.failures.map(({ item, message }, index) => (
              <li key={index}>
                {item.file.name}：{message}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p>{cancelling ? "正在取消，等待当前照片操作结束…" : phaseLabels[state.phase]}</p>
          <p>取消后保留已上传照片。</p>
        </>
      )}
    </Alert>
  );
}

import type { MomentDraftIssue } from "../wechat-moments.ts";
import type { WechatSnapshot } from "../wechat.ts";
import { PersonAvatar } from "./wechat-page.tsx";
import { MomentMediaEditor } from "./wechat-moment-media-editor.tsx";
import type { useMomentCompose } from "./use-wechat-moment-compose.ts";

export function MomentComposeForm({
  editor,
  state,
  reason,
  locked,
  issue,
}: {
  editor: ReturnType<typeof useMomentCompose>;
  state: WechatSnapshot;
  reason: string | null;
  locked: boolean;
  issue: MomentDraftIssue | null;
}) {
  const author = state.people.find((person) => person.id === editor.draft.author.id);
  const name = author?.name ?? editor.draft.author.name;
  return (
    <div className="wechat-moment-editor wechat-moment-compose">
      <div className="wechat-moment-author-line">
        <PersonAvatar path={author?.avatar?.imagePath} name={name} />
        <span>
          <strong>{name}</strong>
          <small>以此身份发布</small>
        </span>
      </div>
      {reason ? <p className="wechat-notice">{reason}</p> : null}
      {editor.error ? (
        <p className="wechat-notice" role="alert">
          {editor.error}
        </p>
      ) : null}
      {editor.imageError ? (
        <p className="wechat-notice" role="alert">
          {editor.imageError}
        </p>
      ) : null}
      <label className="wechat-moment-label">
        正文
        <textarea
          rows={4}
          placeholder="分享此刻的日常…"
          value={editor.draft.text}
          disabled={locked}
          onChange={(event) => editor.setDraft({ ...editor.draft, text: event.target.value })}
        />
      </label>
      <MomentMediaEditor
        media={editor.draft.media}
        disabled={locked}
        onEdit={editor.openMedia}
        onAdd={editor.addMedia}
      />
      {issue ? (
        <p className="wechat-moment-publish-hint" role="status">
          {issue.message}
        </p>
      ) : null}
    </div>
  );
}

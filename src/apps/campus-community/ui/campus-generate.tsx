import { useState } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";
import { CampusPage, type CampusPageProps } from "./campus-page.tsx";

export function CampusGeneratePage(props: CampusPageProps & { postId: string | null }) {
  const { service, state, navigation, postId } = props;
  const [selected, setSelected] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const [manual, setManual] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const completed = submittedId !== null && submittedId === state.completedBatchId;
  const busy = state.phase !== "idle";
  const accounts = state.data.accounts.filter(
    ({ owner, disabled }) =>
      !disabled &&
      (owner.kind !== "person" || !state.data.people.find(({ id }) => id === owner.id)!.disabled),
  );
  const available = selected.filter((id) => accounts.some((account) => account.id === id));
  const title = postId === null ? "生成一批帖子" : "生成本帖互动";

  return (
    <CampusPage {...props} title={title} back={navigation.pop}>
      {completed ? (
        <div className="campus-feedback">
          <p role="status">{postId === null ? "新帖子已保存。" : "本批互动已保存。"}</p>
          <Button onClick={navigation.pop}>{postId === null ? "查看广场" : "返回帖子"}</Button>
        </div>
      ) : null}
      <form
        className="campus-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && (!manual || available.length)) {
            setSubmittedId(service.start(manual ? available : [], instruction, postId));
          }
        }}
      >
        <label>
          本次要求（可选）
          <textarea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            rows={3}
            disabled={busy}
          />
        </label>
        <label>
          <span>
            <input
              type="checkbox"
              checked={manual}
              disabled={busy}
              onChange={(event) => setManual(event.target.checked)}
            />{" "}
            指定候选账号
          </span>
        </label>
        {manual ? (
          accounts.map(({ id, nickname }) => (
            <label key={id}>
              <span>
                <input
                  type="checkbox"
                  checked={selected.includes(id)}
                  disabled={busy}
                  onChange={(event) => {
                    setSelected((previous) =>
                      event.target.checked
                        ? [...previous, id]
                        : previous.filter((item) => item !== id),
                    );
                  }}
                />{" "}
                {nickname}
                {id === state.data.activeAccountId ? "（当前账号）" : ""}
              </span>
            </label>
          ))
        ) : (
          <p className="campus-meta">自动选择账号，可以安排新路人参与。</p>
        )}
        <Button variant="filled" type="submit" disabled={busy || (manual && !available.length)}>
          {title}
        </Button>
      </form>
    </CampusPage>
  );
}

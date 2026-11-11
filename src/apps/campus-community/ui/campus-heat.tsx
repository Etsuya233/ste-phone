import { useEffect, useState } from "react";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { CampusPost } from "../campus-domain.ts";
import { CampusPage, type CampusPageProps } from "./campus-page.tsx";

export function CampusHeatPage(props: CampusPageProps & { postId: string }) {
  const post = props.state.data.posts.find(({ id }) => id === props.postId);
  return post ? (
    <CampusHeatForm {...props} post={post} />
  ) : (
    <CampusPage {...props} title="调整热度" back={props.navigation.pop}>
      <p className="campus-section">帖子已删除。</p>
    </CampusPage>
  );
}

function CampusHeatForm({
  service,
  state,
  navigation,
  post,
}: CampusPageProps & { post: CampusPost }) {
  const [likes, setLikes] = useState(String(post.backgroundLikes));
  const [comments, setComments] = useState(String(post.backgroundComments));
  const [saved, setSaved] = useState(false);
  const [discard, setDiscard] = useState(false);
  const valid = [likes, comments].every(
    (value) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)),
  );
  const dirty =
    likes !== String(post.backgroundLikes) || comments !== String(post.backgroundComments);
  useEffect(() => {
    if (saved && navigation.current) {
      navigation.pop();
    }
  }, [saved, navigation]);

  async function save() {
    if (!valid || state.phase !== "idle") {
      return;
    }
    setSaved(
      await service.command({
        type: "heat",
        postId: post.id,
        likes: Number(likes),
        comments: Number(comments),
      }),
    );
  }

  function back() {
    if (saved || !dirty) {
      navigation.pop();
      return;
    }
    setDiscard(true);
  }

  return (
    <>
      <div inert={discard}>
        <CampusPage service={service} state={state} title="调整热度" back={back}>
          <form
            className="campus-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label>
              背景点赞数
              <input
                inputMode="numeric"
                value={likes}
                onChange={(event) => setLikes(event.target.value)}
              />
            </label>
            <label>
              背景评论数
              <input
                inputMode="numeric"
                value={comments}
                onChange={(event) => setComments(event.target.value)}
              />
            </label>
            <Button
              type="submit"
              variant="filled"
              disabled={saved || !valid || state.phase !== "idle"}
            >
              保存热度
            </Button>
          </form>
        </CampusPage>
      </div>
      {discard ? (
        <Alert
          title="舍弃热度修改？"
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
          尚未保存的背景计数会丢失。
        </Alert>
      ) : null}
    </>
  );
}

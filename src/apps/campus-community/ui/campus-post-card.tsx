import { Button } from "../../../frontend/foundation/button.tsx";
import type { CampusPost } from "../campus-domain.ts";
import { formatCampusCount, formatCampusFullTime, formatCampusTime } from "../campus-display.ts";
import { AccountAvatar, AccountName } from "./campus-avatar.tsx";
import { CommentIcon, HeartIcon } from "./campus-icons.tsx";
import { CampusMedia } from "./campus-media.tsx";
import type { CampusPageProps } from "./campus-page.tsx";

export function CampusPostCard({
  service,
  state,
  navigation,
  post,
  now,
  detail = false,
  highlight = false,
}: Omit<CampusPageProps, "onHome" | "active"> & {
  post: CampusPost;
  now: Date;
  detail?: boolean;
  highlight?: boolean;
}) {
  const author = state.data.accounts.find((account) => account.id === post.authorId)!;
  const current = state.data.activeAccountId;
  const liked = current !== null && post.likes.includes(current);
  const openPost = () => navigation.push({ page: "post", postId: post.id });
  const openImage = (index: number) => navigation.push({ page: "image", postId: post.id, index });
  const date = new Date(post.createdAt);
  const commentCount =
    post.backgroundComments + post.comments.filter((item) => !item.deleted).length;
  const likeCount = post.backgroundLikes + post.likes.length;
  const fullTime = formatCampusFullTime(post.createdAt);

  return (
    <article
      className={`campus-card${detail ? " campus-card--detail" : ""}${highlight ? " campus-card--highlight" : ""}`}
      data-post-id={post.id}
    >
      <AccountAvatar account={author} />
      <div className="campus-card-body">
        <div className="campus-card-heading">
          <AccountName
            account={author}
            onClick={() => navigation.push({ page: "profile", accountId: author.id })}
          />
          <time dateTime={date.toISOString()} title={fullTime}>
            {detail ? fullTime : formatCampusTime(post.createdAt, now)}
          </time>
        </div>
        {post.text ? (
          detail ? (
            <p className="campus-card-text">{post.text}</p>
          ) : (
            <button className="campus-post-text" type="button" onClick={openPost}>
              {post.text}
            </button>
          )
        ) : null}
        <CampusMedia post={post} detail={detail} onOpen={openImage} />
        <div className="campus-card-actions">
          {detail ? (
            <span className="campus-action campus-action--static">
              <CommentIcon />
              <span>{formatCampusCount(commentCount)}</span>
            </span>
          ) : (
            <Button
              className="campus-action"
              aria-label={`查看 ${commentCount.toLocaleString("zh-CN")} 条评论`}
              onClick={openPost}
            >
              <CommentIcon />
              <span>{formatCampusCount(commentCount)}</span>
            </Button>
          )}
          <Button
            className={`campus-action campus-like${liked ? " campus-like--on" : ""}`}
            aria-pressed={liked}
            aria-label={`${liked ? "取消点赞" : "点赞"}，${likeCount.toLocaleString("zh-CN")} 个赞`}
            disabled={!current || state.phase !== "idle"}
            onClick={() => void service.command({ type: "like", postId: post.id })}
          >
            <HeartIcon filled={liked} />
            <span>{formatCampusCount(likeCount)}</span>
          </Button>
        </div>
      </div>
    </article>
  );
}

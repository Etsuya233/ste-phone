import { Button } from "../../../frontend/foundation/button.tsx";
import type { CampusAccount, CampusPost } from "../campus-domain.ts";
import type { CampusPageProps } from "./campus-page.tsx";

export function AccountAvatar({ account }: { account: CampusAccount }) {
  return account.avatar ? (
    <img className="campus-avatar" src={account.avatar} alt="" loading="lazy" />
  ) : (
    <span className="campus-avatar" aria-hidden="true">
      {Array.from(account.nickname)[0]}
    </span>
  );
}

export function AccountLink({ account, onClick }: { account: CampusAccount; onClick: () => void }) {
  return (
    <button type="button" className="campus-account" onClick={onClick}>
      <AccountAvatar account={account} />
      <span>{account.nickname}</span>
    </button>
  );
}

export function CampusPostCard({
  service,
  state,
  navigation,
  post,
  detail = false,
}: Omit<CampusPageProps, "onHome"> & { post: CampusPost; detail?: boolean }) {
  const author = state.data.accounts.find((account) => account.id === post.authorId)!;
  const current = state.data.activeAccountId;
  const liked = current !== null && post.likes.includes(current);
  const openPost = () => navigation.push({ page: "post", postId: post.id });
  const date = new Date(post.createdAt);
  const commentCount =
    post.backgroundComments + post.comments.filter((item) => !item.deleted).length;

  return (
    <article className="campus-card">
      <div className="campus-row">
        <AccountLink
          account={author}
          onClick={() => navigation.push({ page: "profile", accountId: author.id })}
        />
        <time dateTime={date.toISOString()}>
          {date.toLocaleString("zh-CN", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>
      {post.text ? (
        detail ? (
          <p>{post.text}</p>
        ) : (
          <button className="campus-post-text" type="button" onClick={openPost}>
            {post.text}
          </button>
        )
      ) : null}
      {post.images.length ? (
        <div className="campus-photos">
          {post.images.map((image, index) => (
            <button
              key={index}
              type="button"
              aria-label={`查看第 ${index + 1} 张配图`}
              onClick={() => navigation.push({ page: "image", postId: post.id, index })}
            >
              {image.image ? (
                <img src={image.image.path} alt={image.description} loading="lazy" />
              ) : (
                <span>{image.description || image.prompt}</span>
              )}
            </button>
          ))}
        </div>
      ) : null}
      <div className="campus-row">
        <Button
          aria-pressed={liked}
          aria-label={`${liked ? "取消点赞" : "点赞"}，${(post.backgroundLikes + post.likes.length).toLocaleString("zh-CN")} 个赞`}
          disabled={!current || state.phase !== "idle"}
          onClick={() => void service.command({ type: "like", postId: post.id })}
        >
          {liked ? "♥" : "♡"} {(post.backgroundLikes + post.likes.length).toLocaleString("zh-CN")}
        </Button>
        {detail ? (
          <span className="campus-meta">{commentCount.toLocaleString("zh-CN")} 条评论</span>
        ) : (
          <Button onClick={openPost}>
            {commentCount.toLocaleString("zh-CN")} 条评论 · 查看详情
          </Button>
        )}
      </div>
    </article>
  );
}

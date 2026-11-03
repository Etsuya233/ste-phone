/** 输出从本轮实际名单取稳定身份，模拟发布与批内回复，仍不请求真实模型。 */
export function previewMomentOutput(messages: readonly unknown[], mode: string | null): string {
  if (mode === "invalid") {
    return "模拟非法 JSON";
  }
  const user = messages.at(-1) as { content: string | { type: string; text?: string }[] };
  const text =
    typeof user.content === "string"
      ? user.content
      : user.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("");
  const input = JSON.parse(text) as {
    author?: { id: string };
    candidates?: { id: string }[];
    comments?: { id: string }[];
  };
  if (input.author) {
    return JSON.stringify({
      authorId: input.author.id,
      text: "【模拟动态】把今天的小小日常留在这里。",
      media: { type: "images", descriptions: ["窗边摊开的笔记本，阳光照亮书页上的字句。"] },
    });
  }
  if (mode === "empty") {
    return JSON.stringify({ comments: [] });
  }
  const authorId = input.candidates![0]!.id;
  return JSON.stringify({
    comments: [
      {
        authorId,
        text: "【模拟互动】这一刻很适合被记下来。",
        replyTo: input.comments?.length
          ? { type: "existing", commentId: input.comments.at(-1)!.id }
          : null,
      },
      { authorId, text: "【模拟回复】下次一起分享吧。", replyTo: { type: "batch", index: 0 } },
    ],
  });
}

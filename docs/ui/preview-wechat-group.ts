import type { AgentMessage } from "@earendil-works/pi-agent-core";

export function previewWechatGroupOutput(
  messages: readonly AgentMessage[],
  mode: string | null,
): string {
  const user = messages.at(-1);
  if (user?.role !== "user") {
    throw new Error("缺少微信群聊模拟输入");
  }
  const text =
    typeof user.content === "string"
      ? user.content
      : user.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
  const input = JSON.parse(text) as {
    当前操作帐号: string;
    本轮允许发言的人物: string[];
    当前群成员: { id: string; name: string }[];
    可用表情: { marker: string }[];
  };
  if (mode === "invalid") {
    return JSON.stringify({
      messages: [
        { senderId: input.本轮允许发言的人物[0], type: "text", text: "合法消息也不能部分保存" },
        { senderId: input.当前操作帐号, type: "text", text: "模拟无权发言" },
      ],
    });
  }
  return JSON.stringify({
    messages: input.本轮允许发言的人物.map((senderId, index) => ({
      senderId,
      type: "text",
      text:
        (index > 0 && input.可用表情[0]?.marker) ||
        `【模拟群回复】${input.当前群成员.find(({ id }) => id === senderId)!.name}：我看到群消息了。`,
    })),
  });
}

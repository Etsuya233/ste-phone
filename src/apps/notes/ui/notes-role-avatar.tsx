function initialOf(name: string): string {
  const characters = Array.from(name.trim());
  const last = characters.at(-1);
  // Chinese names read more distinctly from the final character; Latin names use the first letter.
  return last && /[\u3400-\u9fff]/.test(last) ? last : (characters[0] ?? "?");
}

/** 用名字中的代表字区分角色，列表无需加载人物头像。 */
export function NotesRoleAvatar({ name }: { name: string }) {
  return (
    <span className="notes-avatar" aria-hidden="true">
      {initialOf(name)}
    </span>
  );
}

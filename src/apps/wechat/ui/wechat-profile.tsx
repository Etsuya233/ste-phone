import { useState } from "react";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { readProfileFields, type ProfileField } from "../profile-fields.ts";
import { PersonAvatar } from "./wechat-page.tsx";

export function PersonIdentity({ name, path }: { name: string; path?: string }) {
  return (
    <div className="wechat-identity">
      <PersonAvatar name={name} path={path} />
      <h2>{name}</h2>
    </div>
  );
}

// “我”页只露三行简介，完整内容留给人物资料页逐字段展开。
export function ProfilePreview({ name, profileText }: { name: string; profileText: string }) {
  const text = visibleFields(name, profileText)
    .map((field) => `${field.label}：${field.value}`)
    .join("\n");
  return text ? <p className="wechat-profile-preview">{text}</p> : null;
}

export function ProfileFields({ name, profileText }: { name: string; profileText: string }) {
  const fields = visibleFields(name, profileText);
  return fields.length ? (
    <GroupedList title="人物简介">
      {fields.map((field, index) => (
        <ProfileFieldRow key={`${field.label}-${index}`} field={field} />
      ))}
    </GroupedList>
  ) : null;
}

// Memory 把姓名字段排在最前，标题已经展示姓名，去掉这一行避免重复。
function visibleFields(name: string, profileText: string): ProfileField[] {
  const fields = readProfileFields(profileText);
  return fields[0]?.value.trim() === name.trim() ? fields.slice(1) : fields;
}

function ProfileFieldRow({ field }: { field: ProfileField }) {
  const [expanded, setExpanded] = useState(false);
  const short = !field.value.includes("\n") && field.value.length <= 12;
  if (short) {
    return (
      <div className="wechat-field wechat-field--inline">
        <span className="wechat-field-label">{field.label}</span>
        <span className="wechat-field-value">{field.value}</span>
      </div>
    );
  }
  const expandable = field.value.includes("\n") || field.value.length > 40;
  const content = (
    <>
      <span className="wechat-field-label">{field.label}</span>
      <span className={`wechat-field-value ${expanded ? "wechat-field-value--expanded" : ""}`}>
        {field.value}
      </span>
      {expandable ? (
        <span className="wechat-field-toggle">{expanded ? "收起" : "展开"}</span>
      ) : null}
    </>
  );
  return expandable ? (
    <button
      type="button"
      className="wechat-field wechat-field--block"
      aria-expanded={expanded}
      onClick={() => setExpanded(!expanded)}
    >
      {content}
    </button>
  ) : (
    <div className="wechat-field wechat-field--block">{content}</div>
  );
}

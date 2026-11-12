import { useEffect, useState } from "react";
import type { ImageHub, ImageRecord } from "../../../core/image-hub/public.ts";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { ImageGrid } from "../../../frontend/images/image-views.tsx";
import { ProfileAvatar } from "../../../frontend/images/profile-avatar.tsx";
import type { CharacterProfile } from "../background.ts";
import {
  characterTextFields,
  type CharacterAvatar,
  type CharacterChanges,
  type CharacterTextField,
} from "../character-overrides.ts";

const fieldNames = {
  name: "姓名",
  personality: "性格",
  background: "背景",
  current_status: "现状",
} as const;

export function CharacterEditor({
  person,
  imageHub,
  active,
  onBack,
  onSave,
}: {
  person: CharacterProfile;
  imageHub: ImageHub;
  active: boolean;
  onBack(): void;
  onSave(changes: CharacterChanges): Promise<void>;
}) {
  const [draft, setDraft] = useState<CharacterChanges>({});
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState<string>();
  const changed = Object.keys(draft).length > 0;
  const avatar = draft.avatar === undefined ? person.avatar : draft.avatar;
  const name = draft.name ?? person.name;
  const fields = person.fields!.filter((item) =>
    characterTextFields.some((key) => key === item.key),
  );

  async function save() {
    setSaving(true);
    setError(undefined);
    try {
      await onSave(draft);
      onBack();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="data-app">
      <Page
        className="data-page"
        inert={discard}
        navBar={
          <NavBar
            title="编辑人物"
            back={{
              label: "详情",
              onClick: () => {
                if (saving) {
                  return;
                }
                if (changed) {
                  setDiscard(true);
                } else {
                  onBack();
                }
              },
            }}
            right={
              <Button disabled={!changed || saving || !name.trim()} onClick={() => void save()}>
                {saving ? "保存中…" : "保存"}
              </Button>
            }
          />
        }
      >
        <div className="data-character-editor">
          <CharacterAvatarField
            hub={imageHub}
            avatar={avatar}
            name={name}
            disabled={saving}
            onChange={(value) => setDraft({ ...draft, avatar: value })}
          />
          {fields.map(({ key: fieldKey, value }) => {
            const key = fieldKey as CharacterTextField;
            return (
              <CharacterField
                key={key}
                field={key}
                value={draft[key] ?? value ?? ""}
                overridden={person.overriddenFields?.includes(key) ?? false}
                restoring={draft[key] === null}
                disabled={saving}
                onChange={(value) => setDraft({ ...draft, [key]: value })}
                onCancelRestore={() =>
                  setDraft((current) => {
                    const next = { ...current };
                    delete next[key];
                    return next;
                  })
                }
              />
            );
          })}
          {error ? (
            <p className="data-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </Page>
      {discard ? (
        <Alert
          title="舍弃人物资料修改？"
          active={active}
          onDismiss={() => setDiscard(false)}
          actions={[
            { label: "继续编辑", onClick: () => setDiscard(false) },
            { label: "舍弃", primary: true, onClick: onBack },
          ]}
        >
          尚未保存的修改会丢失。
        </Alert>
      ) : null}
    </div>
  );
}

function CharacterAvatarField({
  hub,
  avatar,
  name,
  disabled,
  onChange,
}: {
  hub: ImageHub;
  avatar: CharacterAvatar | null | undefined;
  name: string;
  disabled: boolean;
  onChange(value: CharacterAvatar | null): void;
}) {
  const [choosing, setChoosing] = useState(false);
  return (
    <>
      <div className="data-character-actions">
        <ProfileAvatar className="data-character-avatar" path={avatar?.imagePath}>
          {name.slice(0, 1)}
        </ProfileAvatar>
        <Button disabled={disabled} onClick={() => setChoosing(!choosing)}>
          {choosing ? "关闭图库" : "选择头像"}
        </Button>
        {avatar ? (
          <Button disabled={disabled} onClick={() => onChange(null)}>
            清除头像
          </Button>
        ) : null}
      </div>
      {choosing ? (
        <CharacterGallery
          hub={hub}
          selectedId={avatar?.id}
          onChoose={({ id, imagePath }) => {
            onChange({ id, imagePath });
            setChoosing(false);
          }}
          disabled={disabled}
        />
      ) : null}
    </>
  );
}

function CharacterField({
  field,
  value,
  overridden,
  restoring,
  disabled,
  onChange,
  onCancelRestore,
}: {
  field: CharacterTextField;
  value: string;
  overridden: boolean;
  restoring: boolean;
  disabled: boolean;
  onChange(value: string | null): void;
  onCancelRestore(): void;
}) {
  const input = {
    disabled: disabled || restoring,
    value,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
  };
  return (
    <div className="data-character-field">
      <label>
        {fieldNames[field]}
        {field === "name" ? <input {...input} required /> : <textarea {...input} rows={3} />}
      </label>
      {restoring ? (
        <div className="data-character-actions">
          <span>保存后使用当前来源值</span>
          <Button disabled={disabled} onClick={onCancelRestore}>
            取消恢复
          </Button>
        </div>
      ) : overridden ? (
        <div className="data-character-actions">
          <span>已覆写</span>
          <Button disabled={disabled} onClick={() => onChange(null)}>
            恢复来源
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CharacterGallery({
  hub,
  selectedId,
  onChoose,
  disabled,
}: {
  hub: ImageHub;
  selectedId?: string;
  onChoose(image: ImageRecord): void;
  disabled: boolean;
}) {
  const [result, setResult] = useState<{ images: readonly ImageRecord[] } | { error: string }>();
  useEffect(() => {
    let active = true;
    void hub.listImages().then(
      (images) => {
        if (active) {
          setResult({ images });
        }
      },
      (cause: unknown) => {
        if (active) {
          setResult({ error: cause instanceof Error ? cause.message : String(cause) });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [hub]);
  if (!result) {
    return <p role="status">正在读取图库…</p>;
  }
  if ("error" in result) {
    return (
      <p role="alert" className="data-error">
        {result.error}
      </p>
    );
  }
  return (
    <div inert={disabled}>
      <ImageGrid
        images={result.images}
        selectedId={selectedId}
        onOpen={onChoose}
        empty="图库还没有图片。"
      />
    </div>
  );
}

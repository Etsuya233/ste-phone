import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { PhoneSettingsService } from "../settings-service.ts";
import { connectionHeaderError, validateModelConnection } from "../model-connections.ts";
import type { ModelConnection } from "../model-connections.ts";
import type { TestModelConnection } from "../model-connection-test.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { TextField } from "../../../frontend/foundation/text-field.tsx";
import { Alert } from "../../../frontend/foundation/alert.tsx";

export function ModelConnections({
  settings,
  onBack,
  onEdit,
}: {
  settings: PhoneSettingsService;
  onBack: () => void;
  onEdit: (connection: ModelConnection | null) => void;
}) {
  const saved = useSyncExternalStore(settings.subscribe, settings.getState);
  const [error, setError] = useState("");
  const groupName = useId();
  function selectDefault(id: string | null) {
    try {
      settings.selectDefaultModelConnection(id);
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }
  return (
    <Page
      className="model-connections-page"
      navBar={
        <NavBar
          title="模型连接"
          back={{ label: "设置", onClick: onBack }}
          right={
            <Button aria-label="添加模型连接" onClick={() => onEdit(null)}>
              <span className="model-connection-add" aria-hidden="true">
                +
              </span>
            </Button>
          }
        />
      }
    >
      {error ? (
        <p className="model-connection-error" role="alert">
          {error}
        </p>
      ) : null}
      <GroupedList title="默认连接" description="选择一个连接供手机 AI 调用使用。">
        <ListCell
          title={
            <label className="model-connection-choice">
              <input
                className="model-connection-radio"
                type="radio"
                name={groupName}
                aria-label="无默认连接"
                checked={saved.defaultModelConnectionId === null}
                onChange={() => selectDefault(null)}
              />
              <span className="model-connection-check" aria-hidden="true">
                ✓
              </span>
              <span>无默认</span>
            </label>
          }
        />
        {saved.modelConnections.map((connection) => (
          <ListCell
            key={connection.id}
            title={
              <label className="model-connection-choice">
                <input
                  className="model-connection-radio"
                  type="radio"
                  name={groupName}
                  aria-label={`将 ${connection.name} 设为默认`}
                  checked={saved.defaultModelConnectionId === connection.id}
                  onChange={() => selectDefault(connection.id)}
                />
                <span className="model-connection-check" aria-hidden="true">
                  ✓
                </span>
                <span className="ios-cell-copy">
                  <span>{connection.name}</span>
                  <span className="ios-cell-subtitle">{connection.model}</span>
                </span>
              </label>
            }
            accessory={
              <Button
                className="model-connection-info"
                aria-label={`编辑 ${connection.name}`}
                onClick={() => onEdit(connection)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="9.5" />
                  <path d="M12 10.5v7" />
                  <circle className="model-connection-info-dot" cx="12" cy="7" r="1" />
                </svg>
              </Button>
            }
          />
        ))}
      </GroupedList>
      {saved.modelConnections.length === 0 ? (
        <p className="model-connection-note">还没有模型连接，点击右上角「+」添加。</p>
      ) : null}
    </Page>
  );
}

type TestState =
  | { status: "idle" }
  | { status: "running"; text: string }
  | { status: "success"; text: string; truncated: boolean }
  | { status: "error"; message: string };

export function ModelConnectionEditor({
  settings,
  connection,
  testModelConnection,
  current,
  onBack,
}: {
  settings: PhoneSettingsService;
  connection: ModelConnection | null;
  testModelConnection: TestModelConnection;
  current: boolean;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(() => ({
    id:
      connection?.id ??
      [...crypto.getRandomValues(new Uint8Array(16))]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(""),
    name: connection?.name ?? "",
    baseUrl: connection?.baseUrl ?? "",
    apiKey: connection?.apiKey ?? "",
    model: connection?.model ?? "",
    headers: Object.entries(connection?.customHeaders ?? {}).map(([name, value], id) => ({
      id,
      name,
      value,
    })),
  }));
  const draftValue = JSON.stringify({
    ...draft,
    headers: draft.headers.map(({ name, value }) => [name, value]),
  });
  const initialValue = useRef(draftValue);
  const nextHeader = useRef(draft.headers.length);
  const currentTest = useRef<AbortController | null>(null);
  const errorElement = useRef<HTMLParagraphElement>(null);
  const confirmationButton = useRef<HTMLButtonElement>(null);
  const formId = useId();
  const [keyVisible, setKeyVisible] = useState(false);
  const [visibleHeaders, setVisibleHeaders] = useState(new Set<number>());
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<"discard" | "delete" | null>(null);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [testPresented, setTestPresented] = useState(false);
  const dirty = draftValue !== initialValue.current;
  const running = test.status === "running";

  useEffect(() => {
    if (current && error) errorElement.current?.focus();
  }, [current, error]);
  useEffect(() => {
    if (current && confirmation) confirmationButton.current?.focus();
  }, [current, confirmation]);

  useEffect(
    () => () => {
      currentTest.current?.abort();
      currentTest.current = null;
    },
    [],
  );

  function invalidateTest() {
    currentTest.current?.abort();
    currentTest.current = null;
    setTest({ status: "idle" });
    setTestPresented(false);
    setError("");
  }
  function updateRequest(field: "baseUrl" | "apiKey" | "model", value: string) {
    invalidateTest();
    setDraft((previous) => ({ ...previous, [field]: value }));
  }
  function updateHeader(id: number, field: "name" | "value", value: string) {
    invalidateTest();
    setDraft((previous) => ({
      ...previous,
      headers: previous.headers.map((header) =>
        header.id === id ? { ...header, [field]: value } : header,
      ),
    }));
  }
  function connectionFromDraft(): ModelConnection {
    const entries = draft.headers.map(({ name, value }) => [name, value] as const);
    const headerError = connectionHeaderError(entries);
    if (headerError) throw new Error(headerError);
    return validateModelConnection({
      id: draft.id,
      name: draft.name,
      baseUrl: draft.baseUrl,
      apiKey: draft.apiKey,
      model: draft.model,
      customHeaders: Object.fromEntries(entries),
    });
  }
  function cancelTest() {
    currentTest.current?.abort();
    currentTest.current = null;
    setTest({ status: "idle" });
    setTestPresented(false);
  }
  function dismissTest() {
    if (running) cancelTest();
    setTestPresented(false);
  }
  function leave() {
    if (running) cancelTest();
    if (dirty) setConfirmation("discard");
    else onBack();
  }
  function save() {
    try {
      settings.saveModelConnection(connectionFromDraft());
      currentTest.current?.abort();
      currentTest.current = null;
      onBack();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }
  async function startTest() {
    let candidate: ModelConnection;
    try {
      candidate = connectionFromDraft();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return;
    }
    setError("");
    const controller = new AbortController();
    currentTest.current = controller;
    setTestPresented(true);
    setTest({ status: "running", text: "" });
    try {
      const result = await testModelConnection(candidate, controller.signal, (text) => {
        if (currentTest.current === controller && !controller.signal.aborted)
          setTest({ status: "running", text });
      });
      // An edited draft or an unmounted editor no longer owns this response.
      if (currentTest.current !== controller) return;
      currentTest.current = null;
      setTest({ status: "success", ...result });
    } catch (failure) {
      if (currentTest.current !== controller) return;
      currentTest.current = null;
      setTest({
        status: "error",
        message: failure instanceof Error ? failure.message : String(failure),
      });
    }
  }
  function remove() {
    try {
      settings.deleteModelConnection(draft.id);
      currentTest.current?.abort();
      currentTest.current = null;
      onBack();
    } catch (failure) {
      setConfirmation(null);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }
  return (
    <>
      <Page
        className="model-connection-editor"
        inert={testPresented}
        navBar={
          <NavBar
            title={connection ? "编辑连接" : "添加连接"}
            back={{ label: "模型连接", onClick: leave }}
            right={
              <Button type="submit" form={formId}>
                保存
              </Button>
            }
          />
        }
      >
        {confirmation ? (
          <GroupedList
            title={confirmation === "discard" ? "舍弃未保存的修改？" : "删除这个连接？"}
            description={
              confirmation === "delete" ? "删除默认连接后，需要重新选择默认连接。" : undefined
            }
          >
            <div
              className="model-connection-confirmation"
              role="alertdialog"
              aria-label={confirmation === "discard" ? "舍弃未保存的修改？" : "删除这个连接？"}
            >
              <Button ref={confirmationButton} onClick={() => setConfirmation(null)}>
                继续编辑
              </Button>
              <Button variant="danger" onClick={confirmation === "discard" ? onBack : remove}>
                {confirmation === "discard" ? "舍弃修改" : "删除连接"}
              </Button>
            </div>
          </GroupedList>
        ) : null}
        {error ? (
          <p ref={errorElement} tabIndex={-1} className="model-connection-error" role="alert">
            {error}
          </p>
        ) : null}
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          noValidate
          autoComplete="off"
        >
          <GroupedList title="OpenAI Chat Completions">
            <TextField
              label="名称"
              value={draft.name}
              placeholder="连接名称"
              onChange={(event) => {
                const name = event.target.value;
                setError("");
                setDraft((previous) => ({ ...previous, name }));
              }}
            />
            <TextField
              label="Base URL"
              value={draft.baseUrl}
              placeholder="https://example.com/v1"
              type="url"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => updateRequest("baseUrl", event.target.value)}
            />
            <TextField
              label="API Key"
              value={draft.apiKey}
              placeholder="可留空"
              type={keyVisible ? "text" : "password"}
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => updateRequest("apiKey", event.target.value)}
              accessory={
                <Button
                  aria-label={keyVisible ? "隐藏 API Key" : "显示 API Key"}
                  aria-pressed={keyVisible}
                  onClick={() => setKeyVisible((visible) => !visible)}
                >
                  {keyVisible ? "隐藏" : "显示"}
                </Button>
              }
            />
            <TextField
              label="模型"
              value={draft.model}
              placeholder="模型 ID"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => updateRequest("model", event.target.value)}
            />
          </GroupedList>
          <GroupedList
            title="自定义请求头"
            description="API Key 和请求头值会明文保存在插件设置中。自定义 Authorization 优先于 API Key。"
          >
            {draft.headers.map((header, index) => (
              <div className="model-connection-header" key={header.id}>
                <TextField
                  label={`请求头 ${index + 1} 名称`}
                  value={header.name}
                  placeholder="X-Header"
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={(event) => updateHeader(header.id, "name", event.target.value)}
                  accessory={
                    <Button
                      variant="danger"
                      aria-label={`删除请求头 ${index + 1}`}
                      onClick={() => {
                        invalidateTest();
                        setDraft((previous) => ({
                          ...previous,
                          headers: previous.headers.filter((row) => row.id !== header.id),
                        }));
                      }}
                    >
                      删除
                    </Button>
                  }
                />
                <TextField
                  label={`请求头 ${index + 1} 值`}
                  value={header.value}
                  placeholder="可留空"
                  type={visibleHeaders.has(header.id) ? "text" : "password"}
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={(event) => updateHeader(header.id, "value", event.target.value)}
                  accessory={
                    <Button
                      aria-label={`${visibleHeaders.has(header.id) ? "隐藏" : "显示"}请求头 ${index + 1} 值`}
                      aria-pressed={visibleHeaders.has(header.id)}
                      onClick={() =>
                        setVisibleHeaders((previous) => {
                          const next = new Set(previous);
                          if (next.has(header.id)) next.delete(header.id);
                          else next.add(header.id);
                          return next;
                        })
                      }
                    >
                      {visibleHeaders.has(header.id) ? "隐藏" : "显示"}
                    </Button>
                  }
                />
              </div>
            ))}
            <Button
              className="model-connection-wide-action"
              onClick={() => {
                invalidateTest();
                const id = nextHeader.current++;
                setDraft((previous) => ({
                  ...previous,
                  headers: [...previous.headers, { id, name: "", value: "" }],
                }));
              }}
            >
              添加请求头
            </Button>
          </GroupedList>
        </form>
        <GroupedList
          title="测试连接"
          description="使用当前填写的配置发送简短提示，可能产生少量用量。"
        >
          <Button className="model-connection-wide-action" onClick={() => void startTest()}>
            测试连接
          </Button>
        </GroupedList>
        {connection ? (
          <GroupedList>
            <Button
              className="model-connection-wide-action"
              variant="danger"
              onClick={() => {
                if (running) cancelTest();
                setConfirmation("delete");
              }}
            >
              删除连接
            </Button>
          </GroupedList>
        ) : null}
      </Page>
      {testPresented && test.status !== "idle" ? (
        <Alert
          active={current}
          busy={running}
          title={
            test.status === "running"
              ? "正在测试连接"
              : test.status === "error"
                ? "连接失败"
                : test.truncated
                  ? "已连通，达到输出上限"
                  : "连接成功"
          }
          onDismiss={dismissTest}
          actions={
            test.status === "error"
              ? [
                  { label: "取消", onClick: dismissTest },
                  { label: "重试", onClick: () => void startTest(), primary: true },
                ]
              : [{ label: running ? "取消测试" : "好", onClick: dismissTest, primary: !running }]
          }
        >
          {test.status === "error"
            ? test.message
            : test.status === "running"
              ? test.text || "正在等待模型回复…"
              : test.text}
        </Alert>
      ) : null}
    </>
  );
}

import { useState } from "react";
import {
  AgentRun,
  AgentStepText,
  AgentThinking,
  AgentToolCall,
} from "../../../frontend/agent/agent-activity.tsx";
import { ActionSheet, Button, NavBar, Page } from "../../../frontend/foundation/foundation.tsx";
import type { BrowserActivity, BrowserService, BrowserSnapshot } from "../browser-service.ts";
import type { WebsiteWork } from "../browser.ts";
import { BrowserCompassIcon } from "./browser-icons.tsx";
import { BrowserModelPicker, useBrowserModel, type BrowserModels } from "./browser-models.tsx";

export function BrowserConversation({
  work,
  snapshot,
  service,
  models,
  onBack,
}: {
  work: WebsiteWork;
  snapshot: BrowserSnapshot;
  service: BrowserService;
  models: BrowserModels;
  onBack: () => void;
}) {
  const { connection } = useBrowserModel(models);
  const instruction = snapshot.instructions.get(work.id) ?? "";
  const [error, setError] = useState("");
  const [clearing, setClearing] = useState(false);
  const activity = snapshot.activities.get(work.id);
  const generating = snapshot.generation?.workId === work.id;
  const otherGenerating = snapshot.generation !== null && snapshot.generation.workId !== work.id;
  const message = error || snapshot.error;
  return (
    <>
      <Page
        inert={clearing}
        className="browser-page browser-conversation-page"
        navBar={
          <NavBar
            title="创作对话"
            back={{ label: "预览", onClick: onBack }}
            right={
              <Button
                aria-label="清空当前会话"
                disabled={generating || !!snapshot.saving || (!work.turns.length && !activity)}
                onClick={() => setClearing(true)}
              >
                清空
              </Button>
            }
          />
        }
        footerHeight={88}
        footer={
          <form
            className="browser-composer"
            onSubmit={(event) => {
              event.preventDefault();
              if (!connection) {
                return;
              }
              setError("");
              void service
                .generate(work.id, connection.id)
                .catch((cause: Error) => setError(cause.message));
            }}
          >
            <textarea
              aria-label="创作指令"
              rows={2}
              placeholder={`告诉${work.author.name}要做什么网页`}
              value={instruction}
              readOnly={generating}
              onChange={(event) => service.setInstruction(work.id, event.target.value)}
            />
            {generating ? (
              <Button
                variant="danger"
                className="browser-composer-action"
                onClick={(event) => {
                  // 停止会同步换回提交按钮，当前点击不能触发该按钮的提交动作。
                  event.preventDefault();
                  service.stop();
                }}
              >
                停止
              </Button>
            ) : (
              <Button
                type="submit"
                variant="filled"
                className="browser-composer-action"
                disabled={
                  !connection || !instruction.trim() || !!snapshot.generation || !!snapshot.saving
                }
              >
                生成
              </Button>
            )}
          </form>
        }
      >
        <section className="browser-chat">
          <div className="browser-chat-model">
            <BrowserModelPicker models={models} />
          </div>
          {!connection ? (
            <p className="browser-chat-hint">先选择模型连接，再开始创作。</p>
          ) : otherGenerating ? (
            <p className="browser-chat-hint">另一个作品正在创作，完成或停止后才能继续。</p>
          ) : snapshot.saving ? (
            <p className="browser-chat-hint">正在保存作品，保存完成后可以继续创作。</p>
          ) : null}

          {message ? (
            <p className="browser-alert" role="alert">
              {message}
            </p>
          ) : null}
          {activity?.status === "stopped" ? (
            <p className="browser-stopped" role="status">
              已停止本次创作，现有内容没有改动。
            </p>
          ) : null}

          {work.turns.length ? (
            <div className="browser-chat-log" role="log" aria-label="创作对话">
              {work.turns.map((turn, index) => (
                <div className="browser-turn" key={index}>
                  <p className="browser-bubble browser-bubble--user">{turn.instruction}</p>
                  {turn.steps ? (
                    <BrowserCreationActivity
                      activity={{
                        runId: index,
                        turnIndex: index,
                        instruction: turn.instruction,
                        steps: turn.steps,
                        status: "done",
                      }}
                    />
                  ) : null}
                  <p className="browser-turn-answer">{turn.reply}</p>
                </div>
              ))}
            </div>
          ) : !activity ? (
            <div className="browser-chat-empty">
              <span className="browser-chat-empty-mark" aria-hidden="true">
                <BrowserCompassIcon />
              </span>
              <h2>和{work.author.name}一起做网页</h2>
              <p>描述页面内容、风格或交互，也可以直接说要改哪里。</p>
            </div>
          ) : null}
          {activity && activity.status !== "done" ? (
            <div className="browser-turn">
              <p className="browser-bubble browser-bubble--user">{activity.instruction}</p>
              <BrowserCreationActivity key={activity.runId} activity={activity} />
            </div>
          ) : null}
        </section>
      </Page>
      {clearing ? (
        <ActionSheet
          active={true}
          label="清空当前会话"
          description="删除本机保存的当前作品对话、思考与工具记录。网页源码和版本保留，后续创作不再携带这些对话。"
          onDismiss={() => setClearing(false)}
          actions={[
            {
              label: "清空当前会话",
              destructive: true,
              onClick: () => {
                try {
                  service.clearConversation(work.id);
                  setError("");
                } catch (cause) {
                  setError((cause as Error).message);
                }
              },
            },
          ]}
        />
      ) : null}
    </>
  );
}

function BrowserCreationActivity({ activity }: { activity: BrowserActivity }) {
  const running = activity.status === "running";
  const status = {
    running: "正在创作…",
    done: "创作完成",
    failed: "创作失败",
    stopped: "创作已停止",
  }[activity.status];
  return (
    <AgentRun
      running={running}
      failed={activity.status === "failed"}
      stepCount={activity.steps.length + 1}
      label={status}
    >
      {activity.steps.map((step) =>
        step.kind === "thinking" ? (
          <AgentThinking key={step.id} text={step.text} running={running && step.running} />
        ) : step.kind === "text" ? (
          <AgentStepText key={step.id} text={step.text} />
        ) : (
          <AgentToolCall
            key={step.id}
            tool={{
              ...step,
              status: !running && step.status === "running" ? "failed" : step.status,
            }}
          />
        ),
      )}
      <AgentStepText text={status} />
    </AgentRun>
  );
}

import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import { useState } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";
import { Switch } from "../../../frontend/foundation/switch.tsx";
import { SegmentedControl } from "../../../frontend/foundation/segmented-control.tsx";

export function FoundationApp({ onHome, active }: { onHome: () => void; active: boolean }) {
  return (
    <NavigationStack initialRoutes={["root"]} active={active}>
      {(route, navigation) =>
        route === "root" ? (
          <FoundationRoot onHome={onHome} onDetail={() => navigation.push("detail")} />
        ) : (
          <Page
            navBar={
              <NavBar
                title={route === "detail" ? "导航详情" : "下一层"}
                back={{ label: "返回", onClick: navigation.pop }}
              />
            }
          >
            <GroupedList title="页面保留" description="返回后，上一页的滚动位置和控件状态保持。">
              <ListCell title="当前层级" value={route === "detail" ? "第二层" : "第三层"} />
              {route === "detail" ? (
                <ListCell title="进入下一层" onClick={() => navigation.push("nested")} />
              ) : (
                <ListCell title="返回详情" onClick={navigation.pop} />
              )}
            </GroupedList>
          </Page>
        )
      }
    </NavigationStack>
  );
}
function FoundationRoot({ onHome, onDetail }: { onHome: () => void; onDetail: () => void }) {
  const [enabled, setEnabled] = useState(true);
  const [showNav, setShowNav] = useState(true);
  const [showFooter, setShowFooter] = useState(true);
  const [segment, setSegment] = useState("daily");
  const [detail, setDetail] = useState("尚未选择");
  const [count, setCount] = useState(0);
  return (
    <Page
      navBar={
        showNav ? (
          <NavBar
            title="基础组件：很长的导航标题用于检查操作区域"
            back={{ label: "主屏幕", onClick: onHome }}
            right={<Button onClick={() => setCount(count + 1)}>完成</Button>}
          />
        ) : undefined
      }
      footerHeight={showFooter ? 56 : 0}
      footer={
        showFooter ? (
          <div className="foundation-app-footer">
            <Button onClick={onHome}>主屏幕</Button>
            <Button onClick={() => setDetail("底栏操作已执行")}>底栏操作</Button>
          </div>
        ) : undefined
      }
    >
      <GroupedList
        title="页面布局"
        description="顶栏与底栏独立开关。Home 与关闭手机后保留当前状态；在后台退出应用可重新开始。"
      >
        <Switch label="显示导航栏" checked={showNav} onCheckedChange={setShowNav} />
        <Switch label="显示底栏" checked={showFooter} onCheckedChange={setShowFooter} />
        <ListCell title="右侧完成操作次数" value={String(count)} />
      </GroupedList>
      <GroupedList title="按钮" description="每个操作区至少为 44 个逻辑像素。">
        <div className="foundation-app-buttons">
          <Button onClick={() => setDetail("普通按钮已执行")}>普通</Button>
          <Button variant="filled" onClick={() => setDetail("填充按钮已执行")}>
            填充
          </Button>
          <Button variant="danger" onClick={() => setDetail("危险按钮已执行")}>
            危险
          </Button>
          <Button variant="filled" disabled>
            禁用
          </Button>
        </div>
      </GroupedList>
      <GroupedList title="开关" description="开关使用原生复选框，支持 Tab 与空格。">
        <Switch label="接收消息提醒" checked={enabled} onCheckedChange={setEnabled} />
        <Switch label="禁用的开启状态" checked disabled onCheckedChange={() => {}} />
        <Switch label="禁用的关闭状态" checked={false} disabled onCheckedChange={() => {}} />
        <ListCell title="提醒状态" value={enabled ? "开启" : "关闭"} />
        <ListCell
          title="列表内开关"
          accessory={<Switch label="提醒" checked={enabled} onCheckedChange={setEnabled} />}
        />
      </GroupedList>
      <GroupedList title="分段选择">
        <SegmentedControl
          label="查看范围"
          value={segment}
          onValueChange={setSegment}
          options={[
            { value: "daily", label: "今天" },
            { value: "weekly", label: "本周" },
            { value: "unavailable", label: "不可选", disabled: true },
            { value: "all", label: "全部" },
          ]}
        />
        <ListCell title="当前选择" value={segment} />
      </GroupedList>
      <GroupedList
        title="列表与详情"
        description="静态行可放独立操作控件，点击行保留原生按钮语义。"
      >
        <ListCell
          title="点按查看详情"
          subtitle="副文案描述这行的操作"
          value="可打开"
          onClick={onDetail}
        />
        <ListCell
          title="这是一段非常长的单元格主文案，用于检查文字在窄屏中换行且不会挤出右侧的内容"
          subtitle="副文案也可以有较长的说明，保持自然换行"
          value="较长的尾部值也可换行"
        />
        <ListCell
          title="静态行"
          accessory={<Button onClick={() => setDetail("静态行独立按钮已执行")}>操作</Button>}
        />
        <ListCell title="禁用点击行" disabled onClick={() => setDetail("不应执行")} />
        <ListCell title="详情" subtitle={detail} />
      </GroupedList>
      {Array.from({ length: 5 }, (_, index) => (
        <GroupedList key={index} title={`滚动示例 ${index + 1}`}>
          <ListCell
            title={`项目 ${index + 1}`}
            subtitle="继续滚动，检查内容从半透明栏下方经过。"
            value="静态内容"
          />
        </GroupedList>
      ))}
      <GroupedList title="内容末尾" description="最后一行和返回操作应能完整显示。">
        <ListCell title="进入导航详情" subtitle="返回检查此处滚动位置" onClick={onDetail} />
        <ListCell title="返回主屏幕" onClick={onHome} />
      </GroupedList>
    </Page>
  );
}

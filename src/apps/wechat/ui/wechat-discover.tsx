import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";
import type { WechatPageProps } from "./wechat-page.tsx";

/** 发现始终可达；刷新后来源无法识别时，保存空间只按稳定标识提供只读入口。 */
export function WechatDiscover({
  state,
  navigation,
}: Pick<WechatPageProps, "state" | "navigation">) {
  const scopeId = state.momentsScopeId;
  const savedScopes = Object.keys(state.data.moments ?? {});
  return scopeId ? (
    <GroupedList>
      <ListCell title="朋友圈" onClick={() => navigation.push({ page: "moments", scopeId })} />
    </GroupedList>
  ) : savedScopes.length ? (
    <GroupedList
      title="已保存的朋友圈"
      description="当前无法识别资料空间，可按稳定空间标识只读查看。"
    >
      {savedScopes.map((savedScope) => (
        <ListCell
          key={savedScope}
          title={savedScope}
          onClick={() => navigation.push({ page: "moments", scopeId: savedScope })}
        />
      ))}
    </GroupedList>
  ) : (
    <p className="wechat-notice">连接人物资料并选择帐号后，即可进入朋友圈。</p>
  );
}

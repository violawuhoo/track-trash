/**
 * 进度评分（SPEC §8.1）。
 * progressScore = stage*10000 + stepIndex*1000 + branchesDone*200 + day
 * 云端与本地都取大者；相等取 updatedAt 新者。
 *
 * 服务端权威重算，不信任客户端传来的 progressScore。
 */
export interface ProgressInput {
  stage: number;
  stepIndex: number;
  // stay 为第四支线（A2）。可选：老存档没有这个键。
  branches: {
    ship: boolean;
    teashop: boolean;
    birthday: boolean;
    stay?: boolean;
  };
  day: number;
}

/** 进度评分。
 *
 *  A2 说明：`stay` 已进类型，但**本批不计入 branchesDone** ——
 *  支线计分改造不在 A2 范围（GDD 建议 stay 权重与 teashop/birthday 相同），
 *  留到支线计分那一批统一改，避免历史云端分数口径在批次中间漂移。
 */
export function computeProgressScore(s: ProgressInput): number {
  const branchesDone =
    (s.branches.ship ? 1 : 0) +
    (s.branches.teashop ? 1 : 0) +
    (s.branches.birthday ? 1 : 0);
  return s.stage * 10000 + s.stepIndex * 1000 + branchesDone * 200 + s.day;
}

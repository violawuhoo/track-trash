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
  branches: { ship: boolean; teashop: boolean; birthday: boolean };
  day: number;
}

export function computeProgressScore(s: ProgressInput): number {
  const branchesDone =
    (s.branches.ship ? 1 : 0) +
    (s.branches.teashop ? 1 : 0) +
    (s.branches.birthday ? 1 : 0);
  return s.stage * 10000 + s.stepIndex * 1000 + branchesDone * 200 + s.day;
}

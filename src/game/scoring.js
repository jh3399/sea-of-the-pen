// 항해 결과 등급 — 선체를 평가하지 않고, 맵 데이터가 정한 도착 시간만 읽는다.
// 맵마다 거리·장애물 밀도가 다르므로 임계값은 이 파일이 아니라 각 맵 데이터에 둔다.

/**
 * 도착 시간 → 별 3/2/1개.
 *
 * @param {number} seconds 고정 물리 스텝으로 잰 도착 시간(초)
 * @param {{threeStarMaxSeconds:number,twoStarMaxSeconds:number}} scoring 맵별 시간 기준
 */
export function rateTravelTime(seconds, scoring) {
  const three = scoring?.threeStarMaxSeconds;
  const two = scoring?.twoStarMaxSeconds;
  if (!Number.isFinite(three) || !Number.isFinite(two) || three <= 0 || two < three) {
    throw new RangeError('별 시간 기준은 0 < 3별 기준 <= 2별 기준이어야 합니다.');
  }
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError('도착 시간은 0 이상의 유한한 값이어야 합니다.');
  }
  if (seconds <= three) return 3;
  if (seconds <= two) return 2;
  return 1;
}

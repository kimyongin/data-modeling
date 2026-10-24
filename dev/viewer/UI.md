# 공통 뷰어 UI 지침

화면 지침의 정본은 설치 스킬에도 포함하는 [references/viewer-ui.md](../../skills/data-modeling/references/viewer-ui.md)다. 이 파일에 지침을 중복 복사하지 않는다.

[workspace 회귀 검사](../tests/workspace-regressions.mjs)는 오픈마켓·예약·비품의 검색, 확인 사항 전환, 양쪽 패널/드로어 크기 복원, 표 스크롤/포커스, FK 업무 식별 설명과 값 구분, ERD 선택/미니맵 좌표 계산을 검사한다. [기본 검사](../tests/check_workspace.mjs)에서 함께 실행하며 패키징도 이 관문을 통과해야 한다.

Node의 최소 DOM과 좌표 fixture는 실제 브라우저 CSS·폰트·SVG 배치·포인터 검사가 아니다. 허용된 환경에서 1366×768 및 넓은 화면의 배치·잘림·긴 제목·많은 속성·드래그·미니맵 클릭·표 스크롤을 따로 확인한다. 브라우저 접근 정책을 다른 경로로 우회하지 않는다.

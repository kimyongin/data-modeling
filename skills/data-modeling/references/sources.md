# 참고한 공개 스킬

확인일: 2026-10-24. 설계 관점을 비교한 출처다. 원문 스킬·코드·예제·SQL은 복사하지 않고 새로 작성했다. 추후 실질적인 원문을 복사할 때는 해당 버전의 라이선스·저작권 고지 조건을 확인하고 포함한다.

| 출처 | 참고한 관점 | 그대로 채택하지 않은 부분 |
|---|---|---|
| [OneWave-AI / database-schema-designer](https://github.com/OneWave-AI/claude-skills/blob/main/database-schema-designer/SKILL.md) | 짧은 본문과 참조, 실제 조회에 근거한 설계, 실행 검증 | 특정 DB·버전 기본값, 일괄 타입·인덱스 규칙 |
| [jaskirat1616 / sql-schema-designer](https://github.com/jaskirat1616/grok-skills/blob/main/skills/sql-schema-designer/SKILL.md) | 관계·키·정규화·참조 동작의 결정, 당시 스냅샷 구별 | 명사를 모두 테이블로 만드는 접근, 일괄 FK 인덱싱 |
| [cbrock84 / data-modeling](https://github.com/cbrock84/headcount/blob/main/plugins/data-analytics/skills/data-modeling/SKILL.md) | grain, 조인 중복 집계, 차원 이력, 지표 일관성 | 모든 사례에 DW 계층과 팩트/차원 구조 강제 |

실행 시 다른 스킬 설치·로딩을 요구하지 않는다. 실제 대상 API·DB의 사양은 각 작업에서 별도로 조사한다.

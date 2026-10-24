# JSON 생성과 공통 뷰어 확인

새 사례는 데이터만 작성한다. 전용 Python 3.11+ 환경에서 requirements.txt를 설치하고 스킬 폴더의 명령을 사용한다.

```bash
python scripts/validate_model.py source.json
python scripts/build_model.py source.json --output case.model.json
```

검사는 한 번 수행하고 오류·경고 보고서를 생성기와 CLI가 공유한다. 빌더는 원문을 보존하고 JSON과 생성 기록만 만든다. HTML 확장자와 입력을 덮어쓰는 출력 경로는 거부한다. 빌드 기록은 builder_version, 입력/출력 해시, Python 의존성, 경고, 명시적 결과 제거 여부이며 뷰어·스킬 패키지 버전과 무관하다.

직접 작성 파일은 검사 후 동봉된 assets/model-viewer.html에 바로 가져올 수 있다. 뷰어는 JSON 2.0만 읽고 필터와 관계없이 전체 문서를 내보낸다. 업무 데이터는 자동 저장·전송하지 않으며 새로고침하면 빈 화면이다. 성공적으로 새 화면을 활성화한 후에만 이전 화면과 데이터를 교체한다.

새 사례에 Node·뷰어 빌드·렌더러 핀·SQL은 필요 없다. UI 구현 변경·라이브러리 갱신·스킬 배포 작업에서만 개발 저장소의 빌드와 패키징 도구를 사용한다. 설치 ZIP에는 완성된 뷰어가 포함된다. 별도 뷰어 배포는 없다.

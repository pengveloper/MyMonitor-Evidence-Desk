# MyMonitor Alpha — 출처와 고지

## 소스
- 이 앱은 [AGPL-3.0-only](LICENSE)로 공개됩니다. 대응 소스: https://github.com/pengveloper/MyMonitor-Evidence-Desk
- 사건 요약 모델과 기본 화면 구조의 일부는 WorldMonitor에서 왔습니다. 고정 출처와 저작권 고지는 저장소의 `demo/evidence-desk/upstream-provenance.json`과 `docs/design/evidence-desk/SOURCE_NOTICES.md`에 있습니다.
- 번들에 포함된 npm 패키지의 라이선스 원문은 `THIRD_PARTY_NOTICES.txt`에 있고, 포함된 패키지와 소스 모듈 목록은 `BUILD_SCOPE.json`에 있습니다.

## 글꼴
- Pretendard (Copyright 2021 Kil Hyung-jin) 와 Newsreader (Production Type) 는 SIL Open Font License 1.1로 배포됩니다. 원문은 `licenses/Pretendard-OFL.txt`, `licenses/Newsreader-OFL.txt`에 있습니다. 화면에서는 `MM Pretendard`, `MM Newsreader`라는 별도 이름으로 불러옵니다.

## 자료
- 지진: U.S. Geological Survey (USGS) Earthquake Hazards Program 요약 피드. USGS가 만든 자료는 미국 퍼블릭 도메인입니다. 화면의 각 사건은 USGS 원문 페이지로 연결됩니다. 규모·위치는 USGS 검토에 따라 바뀔 수 있습니다.
- 세계 지도 윤곽: 저장소의 `public/data/countries.geojson` (Natural Earth 기반, 퍼블릭 도메인).
- 합성 자료 모드의 사건은 모두 지어낸 것이며 실제 사건이 아닙니다.

## 포함하지 않는 것
- 개인 운영 MyMonitor의 서버, 키, 캐시, 계좌·보유 자료, 학습 사례.
- 유료 시세·뉴스 제공자의 자료와 그 호출 코드 경로. 이 앱에는 유료 호출이 없습니다.
- 방문자 추적, 세션 녹화, 오류 보고 전송.

# Map Area Manager (Cloud Sync)

카카오맵에서 여러 폴리곤 영역을 그리고, 주소가 어느 영역에 포함되는지 확인하는 개인용 웹앱입니다. 폴리곤은 Supabase 클라우드에 저장되므로 여러 컴퓨터에서 같은 계정으로 로그인해 사용할 수 있습니다.

## 포함 기능

- 카카오맵 JavaScript SDK 및 주소 검색
- 다중 폴리곤 그리기, 이름 변경, 삭제
- 주소 좌표의 폴리곤 내부 여부 판정(Turf.js)
- Supabase 클라우드 저장 및 기기 간 동기화
- 이메일/비밀번호 로그인
- JSON 백업 및 복원
- GitHub Actions를 통한 GitHub Pages 자동 배포

## 1. Supabase 설정 (최초 1회)

1. https://supabase.com 에서 프로젝트를 생성합니다.
2. 프로젝트의 **SQL Editor**에서 `supabase-schema.sql` 내용을 실행합니다.
3. **Authentication > Providers > Email**에서 이메일 인증을 사용할지 결정합니다. 개인용으로 계정 하나만 쓸 경우 Dashboard의 **Authentication > Users**에서 사용자 계정을 직접 생성하는 것을 권장합니다.
4. **Authentication > Settings**에서 공개 회원가입을 비활성화합니다(프로젝트 설정 화면의 가입 허용 옵션).
5. **Project Settings > API**에서 Project URL과 `anon` 또는 `publishable` 공개 키를 확인합니다. `service_role` 키는 절대 사용하거나 공개하지 마세요.

테이블 `areas`는 RLS를 사용합니다. 각 행의 `user_id`와 로그인 사용자 ID가 일치할 때만 읽고 쓸 수 있습니다. 클라이언트에 공개되는 anon 키만으로는 RLS를 우회할 수 없습니다.

## 2. 카카오맵 설정

1. https://developers.kakao.com 에서 앱의 플랫폼에 Web을 추가합니다.
2. 개발 중 로컬 실행이 필요하면 `http://localhost:5173`을 등록합니다.
3. 배포 후에는 `https://사용자명.github.io` 또는 실제 GitHub Pages 도메인을 등록합니다.
4. JavaScript 키를 사용합니다. REST API 키가 아닙니다.

## 3. GitHub에 올리기 및 배포

1. 이 프로젝트 폴더의 파일을 GitHub 저장소에 업로드합니다. `node_modules`, `.env`, `dist`는 올리지 않습니다.
2. 기본 브랜치 이름이 `main`인지 확인합니다. 다른 이름이면 `.github/workflows/deploy.yml`의 브랜치 이름을 수정합니다.
3. GitHub 저장소의 **Settings > Secrets and variables > Actions**에서 다음 Repository secrets를 등록합니다.
   - `VITE_KAKAO_MAP_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. **Settings > Pages > Build and deployment > Source**를 `GitHub Actions`로 설정합니다.
5. `main` 브랜치에 push하면 자동으로 빌드·배포됩니다. Actions 탭에서 배포 성공 여부를 확인합니다.
6. GitHub Pages 주소를 열어 등록된 이메일과 비밀번호로 로그인합니다.

## 4. 로컬 테스트

`.env.example`을 복사해 `.env`로 만들고 세 가지 환경변수를 채운 뒤 실행합니다.

```bash
npm install
npm run dev
```

## 데이터 저장 방식 및 보안

- 폴리곤 데이터는 브라우저 IndexedDB가 아니라 Supabase의 `areas` 테이블에 저장됩니다.
- 컴퓨터마다 웹사이트에 접속해 같은 계정으로 로그인하면 같은 폴리곤을 볼 수 있습니다.
- 로그인 세션은 해당 브라우저에 저장되므로 다른 컴퓨터에서는 각각 로그인해야 합니다.
- 데이터베이스는 RLS로 로그인 계정 본인의 데이터만 접근하도록 제한합니다.
- GitHub Pages 주소 자체는 공개될 수 있지만, 로그인하지 않으면 지도 화면과 데이터 기능에 접근할 수 없습니다. 검색엔진 노출이나 웹사이트 주소 공유 자체를 막는 기능은 아닙니다.
- 카카오 JavaScript 키는 브라우저에서 사용되므로 비밀키가 아닙니다. 카카오 개발자 콘솔에서 허용 도메인을 제한하고 사용량을 확인하세요. 키를 HTML/JS에 넣지 않는 것만으로 보호되는 구조는 아닙니다.
- Supabase `anon`/`publishable` 키는 브라우저 공개용입니다. `service_role` 키는 절대 GitHub나 환경변수 `VITE_` 값으로 넣지 마세요.
- JSON 백업은 별도 보관을 권장합니다.

## 기존 IndexedDB 데이터 이전

기존 프로그램이 실행되는 브라우저에서 기존 폴리곤이 보인다면 `백업` 버튼으로 JSON을 먼저 내려받습니다. 클라우드 버전을 배포하고 로그인한 뒤 `불러오기`로 JSON을 업로드하면 해당 계정의 클라우드 데이터로 복원됩니다.

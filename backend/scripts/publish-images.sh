#!/usr/bin/env bash
#
# 개발 머신에서 이미지를 빌드해 GitHub Container Registry(ghcr.io)에 올린다.
#
# 서버(2 vCore/4GB)에서 직접 빌드하면 torch 설치 단계가 30~40분씩 걸리고 메모리도 빠듯하다.
# 빌드는 사양이 넉넉한 개발 머신에서 하고, 서버는 `docker compose pull`로 받기만 한다.
#
# 준비:
#   1. GitHub Personal Access Token에 write:packages 권한 부여
#   2. echo $TOKEN | docker login ghcr.io -u junyoung0321 --password-stdin
#      (gh CLI가 있으면: gh auth token | docker login ghcr.io -u junyoung0321 --password-stdin)
#   3. MCM_Care_Mobile이 이 저장소와 같은 부모 디렉터리에 있어야 한다(AR 인식 빌드 컨텍스트)
#
# 사용법:
#   ./scripts/publish-images.sh              latest 태그로 빌드·푸시
#   IMAGE_TAG=demo ./scripts/publish-images.sh   특정 태그로
#
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

TAG="${IMAGE_TAG:-latest}"
OWNER="junyoung0321"
SERVICES=(backend defect-detection ar-identification)

info() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
fail() { printf '\033[31m!! %s\033[0m\n' "$*" >&2; exit 1; }

[[ -d "../MCM_Care_Mobile/server/ar-identification" ]] \
  || fail "../MCM_Care_Mobile/server/ar-identification 을 찾을 수 없다. 두 저장소를 나란히 두고 실행할 것."

docker info >/dev/null 2>&1 || fail "도커가 실행 중이 아니다."

# compose가 .env의 JWT_SECRET/CLOUDINARY_URL을 요구하지만(:? 문법) 빌드에는 필요 없다.
# .env가 없어도 빌드는 되도록 더미 값을 넣어준다.
export JWT_SECRET="${JWT_SECRET:-build-time-placeholder-not-used-32chars}"
export CLOUDINARY_URL="${CLOUDINARY_URL:-cloudinary://key:secret@demo}"
export IMAGE_TAG="$TAG"

info "빌드 (태그: $TAG)"
docker compose build "${SERVICES[@]}"

info "푸시"
for svc in "${SERVICES[@]}"; do
  image="ghcr.io/$OWNER/mcm-nomad-passport-$svc:$TAG"
  echo "  $image"
  docker push -q "$image" || fail "푸시 실패: $image — ghcr.io 로그인 상태를 확인할 것."
done

info "완료"
cat <<EOF
서버에서 받을 때:

  cd MCM_Passport
  IMAGE_TAG=$TAG docker compose pull
  IMAGE_TAG=$TAG docker compose up -d

처음 푸시한 패키지는 ghcr.io에서 비공개다. 서버가 로그인 없이 받게 하려면
https://github.com/users/$OWNER/packages 에서 각 패키지를 public으로 바꾸거나,
서버에서도 read:packages 토큰으로 docker login 할 것.
EOF

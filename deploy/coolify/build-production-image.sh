#!/usr/bin/env bash
set -Eeuo pipefail

readonly script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly api_repo="${API_REPO_DIR:-$(cd -- "$script_dir/../.." && pwd)}"
readonly app_repo="${APP_REPO_DIR:?Set APP_REPO_DIR to clean ioe_app checkout}"
readonly expected_api_sha="${EXPECTED_API_SHA:?Set EXPECTED_API_SHA to reviewed API commit}"
readonly expected_app_sha="${EXPECTED_APP_SHA:?Set EXPECTED_APP_SHA to reviewed App commit}"
readonly build_memory_limit="${BUILD_MEMORY_LIMIT:-}"

fail() { echo "ERROR: $*" >&2; exit 1; }

[[ "$expected_api_sha" =~ ^[0-9a-f]{40}$ ]] || fail 'EXPECTED_API_SHA must be a full lowercase Git SHA.'
[[ "$expected_app_sha" =~ ^[0-9a-f]{40}$ ]] || fail 'EXPECTED_APP_SHA must be a full lowercase Git SHA.'

api_root="$(git -C "$api_repo" rev-parse --show-toplevel 2>/dev/null)" || fail 'API_REPO_DIR is not a Git checkout.'
app_root="$(git -C "$app_repo" rev-parse --show-toplevel 2>/dev/null)" || fail 'APP_REPO_DIR is not a Git checkout.'
script_repo_root="$(git -C "$script_dir/../.." rev-parse --show-toplevel 2>/dev/null)" || fail 'Build script is outside API Git checkout.'

[[ "$api_root" == "$script_repo_root" ]] || fail 'Build script and API source must come from same checkout.'
[[ "$(git -C "$api_root" rev-parse HEAD)" == "$expected_api_sha" ]] || fail 'API HEAD differs from EXPECTED_API_SHA.'
[[ "$(git -C "$app_root" rev-parse HEAD)" == "$expected_app_sha" ]] || fail 'App HEAD differs from EXPECTED_APP_SHA.'
[[ -z "$(git -C "$api_root" status --porcelain --untracked-files=all)" ]] || fail 'API checkout has uncommitted or untracked changes.'
[[ -z "$(git -C "$app_root" status --porcelain --untracked-files=all)" ]] || fail 'App checkout has uncommitted or untracked changes.'

for repo in "$api_root" "$app_root"; do
  if git -C "$repo" ls-tree -r --name-only HEAD \
    | grep -Eiq '(^|/)(crm-ioe-management|ioe_crm_back|ioe_crm_front|crm_ioe)(/|$)'; then
    fail 'Retired CRM path detected in release source.'
  fi

  if git -C "$repo" ls-tree -r --name-only HEAD | grep -Eiv '^assets/\.env$' \
    | grep -Eiq '(^|/)(\.env(\..*)?|[^/]+\.(pem|key|p12|pfx|cer|crt|bak|trn|mdf|ldf)|backups?)(/|$)'; then
    fail 'Secret, key, certificate, or backup path detected in release source.'
  fi
done

api_short="${expected_api_sha:0:12}"
app_short="${expected_app_sha:0:12}"
image_tag="ioe-allinone:production-${api_short}-${app_short}"
docker image inspect "$image_tag" >/dev/null 2>&1 && fail "Candidate tag already exists: $image_tag"

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/ioe-production-build.XXXXXXXX")"
trap 'rm -rf -- "$work_dir"' EXIT
context="$work_dir/context"
mkdir -p "$context/ioe-api" "$context/ioe_app" "$context/deploy"

git -C "$api_root" archive "$expected_api_sha" | tar -xf - -C "$context/ioe-api"
git -C "$app_root" archive "$expected_app_sha" | tar -xf - -C "$context/ioe_app"
find "$context" -type f \( -name '.env' -o -name '.env.*' \) -delete
install -m 0644 "$script_dir/Dockerfile.production" "$context/Dockerfile"
install -m 0644 "$script_dir/nginx-production.conf" "$context/deploy/nginx-production.conf"
install -m 0644 "$script_dir/.dockerignore.production" "$context/.dockerignore"

echo "Building candidate: API ${expected_api_sha}, App ${expected_app_sha}."
build_args=(--progress=plain)
if [[ -n "$build_memory_limit" ]]; then
  build_args+=(--resource "memory=${build_memory_limit}")
fi
docker buildx build "${build_args[@]}" \
  --build-arg "API_SHA=$expected_api_sha" \
  --build-arg "APP_SHA=$expected_app_sha" \
  --tag "$image_tag" \
  --load \
  "$context"

actual_api_sha="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision-api"}}' "$image_tag")"
actual_app_sha="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision-app"}}' "$image_tag")"
[[ "$actual_api_sha" == "$expected_api_sha" ]] || fail 'Built image API revision label mismatch.'
[[ "$actual_app_sha" == "$expected_app_sha" ]] || fail 'Built image App revision label mismatch.'
image_id="$(docker image inspect --format '{{.Id}}' "$image_tag")"

echo "Candidate ready: $image_tag"
echo "Image ID: $image_id"
echo 'No service was started, recreated, retagged, or pruned.'

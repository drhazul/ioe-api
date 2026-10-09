#!/usr/bin/env bash
set -Eeuo pipefail

readonly root_dir=/opt/ioe-coolify-auto
readonly state_dir=/var/lib/ioe-coolify-auto
readonly state_file="$state_dir/active-heads"
readonly compose_file=/data/coolify/services/tysuzjl0xcdbhfje49pbcqyg/docker-compose.yml
readonly container_name=standby-front-tysuzjl0xcdbhfje49pbcqyg
readonly image_tag=ioe-allinone:standby-auto
readonly api_url=https://github.com/drhazul/ioe-api.git
readonly app_url=https://github.com/drhazul/ioe_app.git

mkdir -p "$state_dir"
chmod 700 "$state_dir"
exec 9>"$state_dir/update.lock"
flock -n 9 || { echo 'Another standby update is active; skipping.'; exit 0; }

validate_compose() {
  docker compose -f "$compose_file" config --format json | python3 -c '
import json, sys
d = json.load(sys.stdin)
assert set(d["services"]) == {"standby-front"}, "unexpected services"
s = d["services"]["standby-front"]
assert s["image"] == "ioe-allinone:standby-auto", "unexpected image"
assert s["pull_policy"] == "never", "unexpected pull policy"
assert s["entrypoint"] == ["/usr/sbin/nginx"], "API must remain stopped"
assert s.get("volumes") is None, "unexpected mounts"
assert s["ports"] == [{"mode":"ingress","host_ip":"172.16.100.40","target":8085,"published":"18085","protocol":"tcp"}], "unexpected port"
'
}

validate_compose
api_remote=$(git ls-remote "$api_url" refs/heads/master | cut -f1)
app_remote=$(git ls-remote "$app_url" refs/heads/master | cut -f1)
[[ "$api_remote" =~ ^[0-9a-f]{40}$ && "$app_remote" =~ ^[0-9a-f]{40}$ ]] || {
  echo 'Unable to resolve both GitHub master branches.' >&2
  exit 1
}

if [[ -f "$state_file" ]]; then
  read -r old_api old_app < "$state_file"
  if [[ "$api_remote" == "$old_api" && "$app_remote" == "$old_app" ]]; then
    echo "No source change: API ${api_remote:0:12}, App ${app_remote:0:12}."
    exit 0
  fi
fi

work_dir=$(mktemp -d "$state_dir/build.XXXXXXXX")
candidate="ioe-allinone:standby-candidate-$(date -u +%Y%m%d%H%M%S)"
cleanup() {
  rm -rf -- "$work_dir"
  docker image rm "$candidate" >/dev/null 2>&1 || true
}
trap cleanup EXIT

git clone --quiet --depth 1 --single-branch --branch master "$api_url" "$work_dir/api-repo"
git clone --quiet --depth 1 --single-branch --branch master "$app_url" "$work_dir/app-repo"
api_sha=$(git -C "$work_dir/api-repo" rev-parse HEAD)
app_sha=$(git -C "$work_dir/app-repo" rev-parse HEAD)
if git -C "$work_dir/api-repo" ls-tree -r --name-only HEAD \
   | grep -Eiq '(^|/)(crm-ioe-management|ioe_crm_back|ioe_crm_front|crm_ioe)(/|$)' \
   || git -C "$work_dir/app-repo" ls-tree -r --name-only HEAD \
   | grep -Eiq '(^|/)(crm-ioe-management|ioe_crm_back|ioe_crm_front|crm_ioe)(/|$)'; then
  echo 'Retired CRM paths detected; automatic build blocked.' >&2
  exit 1
fi
mkdir -p "$work_dir/context/ioe-api" "$work_dir/context/ioe_app" "$work_dir/context/deploy"
git -C "$work_dir/api-repo" archive HEAD | tar -xf - -C "$work_dir/context/ioe-api"
git -C "$work_dir/app-repo" archive HEAD | tar -xf - -C "$work_dir/context/ioe_app"
rm -f -- "$work_dir/context/ioe_app/assets/.env"
install -m 0644 "$root_dir/Dockerfile.standby-auto" "$work_dir/context/Dockerfile"
install -m 0644 "$root_dir/nginx-standby.conf" "$work_dir/context/deploy/nginx.conf"
install -m 0644 "$root_dir/.dockerignore.standby-auto" "$work_dir/context/.dockerignore"

echo "Building API ${api_sha:0:12}, App ${app_sha:0:12}."
docker build --progress=plain \
  --build-arg "API_SHA=$api_sha" --build-arg "APP_SHA=$app_sha" \
  -t "$candidate" "$work_dir/context"

validate_compose
previous_id=$(docker image inspect --format '{{.Id}}' "$image_tag")
docker image tag "$previous_id" ioe-allinone:standby-previous
docker image tag "$candidate" "$image_tag"

rollback() {
  echo 'New standby front failed; restoring previous image.' >&2
  docker image tag "$previous_id" "$image_tag"
  docker compose -f "$compose_file" up -d --no-deps --force-recreate standby-front
}

if ! docker compose -f "$compose_file" up -d --no-deps --force-recreate standby-front; then
  rollback
  exit 1
fi

healthy=0
for _ in $(seq 1 30); do
  if [[ $(docker inspect -f '{{.State.Health.Status}}' "$container_name" 2>/dev/null || true) == healthy ]] \
     && curl --silent --show-error --fail --output /dev/null http://172.16.100.40:18085/; then
    healthy=1
    break
  fi
  sleep 5
done
if [[ "$healthy" != 1 ]]; then
  rollback
  exit 1
fi

printf '%s %s\n' "$api_sha" "$app_sha" > "$state_file.tmp"
chmod 600 "$state_file.tmp"
mv -f -- "$state_file.tmp" "$state_file"
echo "Standby front updated: API ${api_sha:0:12}, App ${app_sha:0:12}. API process remains stopped."

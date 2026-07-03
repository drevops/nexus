#!/usr/bin/env bash
##
# Launch the Nexus diagram generator against a sample configuration.
#
# Renders a config directory to a self-contained, timestamped HTML report under
# playground/.output/ (git-ignored), so repeated runs never collide.
#
# Usage:
#   playground/run.sh [CONFIG_DIR] [ANNOTATIONS_YML]
#
# With no arguments it renders the bundled PBS example with its annotation
# overlay. Pass a config directory (and optionally an annotation file) to render
# something else, e.g.:
#   playground/run.sh tests/phpunit/Fixtures/config-min
#
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root_dir="$(dirname "${script_dir}")"
output_dir="${script_dir}/.output"

config_dir="${1:-${root_dir}/examples/pbs/config}"
annotations="${2:-${root_dir}/examples/pbs/annotations.yml}"

if [ ! -d "${config_dir}" ]; then
  echo "Config directory not found: ${config_dir}" >&2
  exit 1
fi

mkdir -p "${output_dir}"

name="$(basename "${config_dir}")"
if [ "${name}" = "config" ]; then
  name="$(basename "$(dirname "${config_dir}")")"
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
output_file="${output_dir}/${name}-${timestamp}.html"

args=("${config_dir}" --output "${output_file}")
if [ -f "${annotations}" ]; then
  args+=(--annotations "${annotations}")
fi

"${root_dir}/nexus" "${args[@]}"

echo "Open: ${output_file}"

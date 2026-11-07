#!/bin/sh
# Turns a source clip into the site's looping background video (stage 19, D099):
# a seamless loop (its last moment cross-fades into its first), no audio, VP9
# WebM and H.264 MP4 at 720 and 480 pixels wide, and a WebP poster for each.
#
#   usage: scripts/encode-loop.sh <source.mp4> <start-seconds> <end-seconds> <name>
#   e.g.:  scripts/encode-loop.sh ../../clip.mp4 6.6 12.9 candles-v1
#
# Choose start and end so nothing but ambient movement is in the loop (no hands,
# no faces). Bump the name's version when the video changes: the files are cached
# for a year (next.config.ts).
#
# Needs uv: it runs a pinned ffmpeg (imageio-ffmpeg 0.6.0, ffmpeg 7.1 from
# gyan.dev) in a throwaway environment; nothing is installed.
set -eu
src=$1
start=$2
end=$3
name=$4
out="$(dirname "$0")/../public/media"
fade=0.8

ff=$(uvx --quiet --from "imageio-ffmpeg==0.6.0" python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())" | tr -d '\r')
calc() { awk "BEGIN { printf \"%.3f\", $1 }"; }
length=$(calc "$end - $start")
body=$(calc "$length - $fade")   # the loop's length
offset=$(calc "$body - $fade")   # where the end starts fading into the beginning
still=$(calc "$start + $fade")   # the loop's first frame, for the poster

mkdir -p "$out"
for width in 720 480; do
  # xfade needs a constant frame rate on both inputs, so each branch is pinned to 30 fps.
  graph="[0:v]trim=start=$start:end=$end,setpts=PTS-STARTPTS,fps=30,split[a][b];\
[a]trim=start=$fade,setpts=PTS-STARTPTS,fps=30[body];[b]trim=end=$fade,setpts=PTS-STARTPTS,fps=30[head];\
[body][head]xfade=transition=fade:duration=$fade:offset=$offset,scale=$width:-2:flags=lanczos,format=yuv420p[v]"
  crf_vp9=$([ "$width" = 720 ] && echo 36 || echo 38)
  crf_264=$([ "$width" = 720 ] && echo 27 || echo 28)
  "$ff" -hide_banner -loglevel error -y -i "$src" -filter_complex "$graph" -map "[v]" -an \
    -c:v libvpx-vp9 -crf "$crf_vp9" -b:v 0 -deadline good -cpu-used 1 -row-mt 1 "$out/$name-$width.webm"
  "$ff" -hide_banner -loglevel error -y -i "$src" -filter_complex "$graph" -map "[v]" -an \
    -c:v libx264 -crf "$crf_264" -preset slow -profile:v high -movflags +faststart "$out/$name-$width.mp4"
  "$ff" -hide_banner -loglevel error -y -ss "$still" -i "$src" -frames:v 1 \
    -vf "scale=$width:-2:flags=lanczos" -c:v libwebp -quality 72 "$out/$name-$width.webp"
done
echo "loop: $body s"
ls -l "$out"

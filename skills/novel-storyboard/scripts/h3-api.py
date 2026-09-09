#!/usr/bin/env python3
"""Small, dependency-free client for CompShare MiniMax H3 video tasks."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


BASE_URL = "https://cp.compshare.cn"
LOCAL_KEY_FILE = Path.home() / ".codex" / "secrets" / "compshare-h3.key"
TERMINAL_STATUSES = {"succeeded", "failed", "cancelled"}
VALID_RATIOS = {"adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"}
VALID_RESOLUTIONS = {"768P", "2K"}
REF2VA_FIELDS = (
    "subject_definitions:",
    "summary:",
    "retention_analysis:",
    "detailed_description:",
    "overall_soundscape:",
    "non_diegetic_music:",
)


class H3Error(RuntimeError):
    pass


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8-sig") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise H3Error(f"JSON root must be an object: {path}")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def extract_prompt(path: Path) -> str:
    text = path.read_text(encoding="utf-8-sig").strip()
    lines = text.splitlines()
    separators = [index for index, line in enumerate(lines) if line.strip() == "---"]
    if separators:
        text = "\n".join(lines[separators[-1] + 1 :]).strip()
    return text


def ref2va_section_characters(prompt: str) -> dict[str, int]:
    """Validate and measure an official six-section Ref2VA prompt."""
    if not any(field in prompt for field in REF2VA_FIELDS):
        return {}
    counts = {field: prompt.count(field) for field in REF2VA_FIELDS}
    invalid = [field for field, count in counts.items() if count != 1]
    if invalid:
        detail = ", ".join(f"{field}={counts[field]}" for field in invalid)
        raise H3Error(f"Ref2VA fields must each appear exactly once: {detail}")
    positions = [prompt.index(field) for field in REF2VA_FIELDS]
    if positions != sorted(positions):
        raise H3Error("Ref2VA fields are not in the official six-section order")
    result: dict[str, int] = {}
    for index, field in enumerate(REF2VA_FIELDS):
        start = positions[index] + len(field)
        end = positions[index + 1] if index + 1 < len(positions) else len(prompt)
        result[field[:-1]] = len(prompt[start:end].strip())
    return result


def resolve_job(job_path: Path) -> tuple[dict[str, Any], str, Path]:
    job_path = job_path.resolve()
    job = read_json(job_path)
    base = job_path.parent

    prompt_file = job.get("promptFile")
    if not isinstance(prompt_file, str) or not prompt_file.strip():
        raise H3Error("job.promptFile is required")
    prompt_path = (base / prompt_file).resolve()
    if not prompt_path.is_file():
        raise H3Error(f"Prompt file not found: {prompt_path}")
    prompt = extract_prompt(prompt_path)
    job["_promptMainCharacters"] = len(prompt)
    job["_promptSections"] = ref2va_section_characters(prompt)
    prompt_suffix = job.get("promptSuffix", "")
    if prompt_suffix:
        if not isinstance(prompt_suffix, str):
            raise H3Error("job.promptSuffix must be a string")
        prompt = f"{prompt}\n\n{prompt_suffix.strip()}"
    if not prompt:
        raise H3Error("Prompt is empty")
    # CompShare's gateway applies a stricter limit than MiniMax's official
    # H3 endpoint: the prompt plus any configured suffix must fit in 5,000
    # Unicode characters. Validate the exact submitted text so an authorized
    # paid request cannot fail only after it reaches the provider.
    if len(prompt) > 5000:
        raise H3Error(
            "Combined prompt text exceeds CompShare's 5000-character limit: "
            f"{len(prompt)}"
        )
    job["_promptSuffixCharacters"] = len(prompt) - job["_promptMainCharacters"]

    duration = job.get("duration")
    if not isinstance(duration, int) or not 4 <= duration <= 15:
        raise H3Error("job.duration must be an integer from 4 to 15")
    if job.get("resolution") not in VALID_RESOLUTIONS:
        raise H3Error(f"job.resolution must be one of: {', '.join(sorted(VALID_RESOLUTIONS))}")
    ratio = job.get("ratio")
    if ratio not in VALID_RATIOS:
        raise H3Error(f"Unsupported ratio: {ratio!r}")
    use_context_ir = job.get("useContextIr", False)
    if not isinstance(use_context_ir, bool):
        raise H3Error("job.useContextIr must be a boolean")

    references = job.get("referenceImages", [])
    if not isinstance(references, list) or len(references) > 9:
        raise H3Error("job.referenceImages must be an array with at most 9 items")
    minimum = job.get("minimumReferences", 0)
    if not isinstance(minimum, int) or minimum < 0:
        raise H3Error("job.minimumReferences must be a non-negative integer")
    if len(references) < minimum:
        raise H3Error(f"Need at least {minimum} reference image URLs; found {len(references)}")

    roles: list[str] = []
    local_hashes: list[str] = []
    remote_basenames: list[str] = []
    for index, reference in enumerate(references, start=1):
        if not isinstance(reference, dict):
            raise H3Error(f"referenceImages[{index}] must be an object")
        url = reference.get("url")
        local_path = reference.get("path")
        role = reference.get("role", "reference_image")
        if bool(url) == bool(local_path):
            raise H3Error(f"Reference image {index} must define exactly one of url or path")
        if url:
            if not isinstance(url, str) or url.startswith("REPLACE_"):
                raise H3Error(f"Reference image {index} still needs a public URL")
            parsed = urllib.parse.urlparse(url)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise H3Error(f"Reference image {index} is not an HTTP(S) URL")
            basename = Path(urllib.parse.unquote(parsed.path)).name.casefold()
            if not basename:
                raise H3Error(f"Reference image {index} URL has no terminal filename")
            if basename in remote_basenames:
                raise H3Error(
                    f"Reference image {index} reuses URL filename {basename!r}; "
                    "use local path inputs or stable URLs with unique filenames"
                )
            remote_basenames.append(basename)
        else:
            if not isinstance(local_path, str) or not local_path.strip():
                raise H3Error(f"Reference image {index} has an invalid local path")
            resolved_path = (base / local_path).resolve()
            if not resolved_path.is_file():
                raise H3Error(f"Reference image {index} was not found: {resolved_path}")
            mime, _ = mimetypes.guess_type(resolved_path.name)
            if mime not in {"image/jpeg", "image/png", "image/webp"}:
                raise H3Error(f"Reference image {index} has unsupported format: {resolved_path.suffix}")
            raw = resolved_path.read_bytes()
            if len(raw) > 30 * 1024 * 1024:
                raise H3Error(f"Reference image {index} exceeds 30 MB")
            digest = hashlib.sha256(raw).hexdigest()
            if digest in local_hashes:
                raise H3Error(f"Reference image {index} duplicates an earlier local image")
            local_hashes.append(digest)
            reference["_dataUrl"] = f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"
            reference["_sha256"] = digest
        if role not in {"first_frame", "last_frame", "reference_image"}:
            raise H3Error(f"Unsupported image role at item {index}: {role!r}")
        roles.append(role)
    if "last_frame" in roles and "first_frame" not in roles:
        raise H3Error("last_frame requires first_frame")
    if "reference_image" in roles and ({"first_frame", "last_frame"} & set(roles)):
        raise H3Error("Reference images cannot be mixed with first/last-frame mode")

    output = job.get("output")
    if not isinstance(output, str) or not output.strip():
        raise H3Error("job.output is required")
    output_path = (base / output).resolve()
    return job, prompt, output_path


def build_payload(job: dict[str, Any], prompt: str) -> dict[str, Any]:
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for reference in job.get("referenceImages", []):
        image_source = reference.get("_dataUrl") or reference.get("url")
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": image_source},
                "role": reference.get("role", "reference_image"),
            }
        )
    return {
        "model": "MiniMax-H3",
        "content": content,
        "resolution": job["resolution"],
        "duration": job["duration"],
        "ratio": job["ratio"],
        "use_context_ir": job.get("useContextIr", False),
        "aigc_watermark": bool(job.get("aigcWatermark", False)),
    }


def api_key() -> str:
    key = os.environ.get("COMPSHARE_H3_API_KEY", "").strip()
    configured_key_file = os.environ.get("COMPSHARE_H3_KEY_FILE", "").strip()
    key_file = Path(configured_key_file).expanduser() if configured_key_file else LOCAL_KEY_FILE
    if not key and key_file.is_file():
        key = key_file.read_text(encoding="utf-8-sig").strip()
    if not key:
        raise H3Error(
            "No API key was found. Set COMPSHARE_H3_API_KEY, COMPSHARE_H3_KEY_FILE, "
            "or save the key at ~/.codex/secrets/compshare-h3.key. "
            "Keep the key out of chat, job JSON, screenshots, and source control."
        )
    if not key.startswith("sk-ml-"):
        raise H3Error("COMPSHARE_H3_API_KEY does not look like an sk-ml- model API key")
    return key


def request_json(
    method: str,
    path: str,
    *,
    body: dict[str, Any] | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {api_key()}",
        "Accept": "application/json",
    }
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    request = urllib.request.Request(BASE_URL + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise H3Error(f"API HTTP {exc.code}: {raw}") from exc
    except urllib.error.URLError as exc:
        raise H3Error(f"API connection failed: {exc.reason}") from exc
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise H3Error(f"API returned non-JSON data: {raw[:500]}") from exc
    if not isinstance(value, dict):
        raise H3Error("API returned an unexpected JSON root")
    return value


def cmd_preflight(args: argparse.Namespace) -> int:
    job, prompt, output = resolve_job(args.job)
    payload = build_payload(job, prompt)
    summary = {
        "segment": job.get("segment"),
        "resolution": payload["resolution"],
        "ratio": payload["ratio"],
        "duration": payload["duration"],
        "useContextIr": payload["use_context_ir"],
        "referenceImages": len(payload["content"]) - 1,
        "referenceSources": [
            {
                "source": "embedded-local" if item.get("path") else "public-url",
                "sha256": item.get("_sha256", "remote-not-read")[:12],
            }
            for item in job.get("referenceImages", [])
        ],
        "promptCharacters": len(prompt),
        "promptMainCharacters": job.get("_promptMainCharacters", len(prompt)),
        "promptSuffixCharacters": job.get("_promptSuffixCharacters", 0),
        "promptRemainingCharacters": 5000 - len(prompt),
        "promptSectionCharacters": job.get("_promptSections", {}),
        "output": str(output),
        "ready": True,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


def cmd_submit(args: argparse.Namespace) -> int:
    job, prompt, output = resolve_job(args.job)
    payload = build_payload(job, prompt)
    if args.dry_run:
        safe = dict(payload)
        safe["content"] = [
            item if item["type"] == "text" else {**item, "image_url": {"url": "<redacted-url>"}}
            for item in payload["content"]
        ]
        print(json.dumps(safe, ensure_ascii=False, indent=2))
        return 0

    request_key = f"{job.get('segment', 'h3')}-{uuid.uuid4()}"
    response = request_json(
        "POST",
        "/minimax/v2/video_generation",
        body=payload,
        idempotency_key=request_key,
    )
    task_id = response.get("task_id")
    if not isinstance(task_id, str) or not task_id:
        raise H3Error(f"Submission response has no task_id: {response}")
    state_path = args.state or args.job.parent / "runs" / f"{job.get('segment', 'h3')}-{task_id}.json"
    state = {
        "segment": job.get("segment"),
        "taskId": task_id,
        "status": "submitted",
        "submittedAt": datetime.now(timezone.utc).isoformat(),
        "jobFile": str(args.job.resolve()),
        "output": str(output),
        "idempotencyKey": request_key,
        "references": [
            {
                "source": "embedded-local" if item.get("path") else "public-url",
                "sha256": item.get("_sha256"),
                "path": item.get("path"),
                "url": item.get("url"),
            }
            for item in job.get("referenceImages", [])
        ],
        "response": response,
    }
    write_json(state_path.resolve(), state)
    print(json.dumps({"taskId": task_id, "state": str(state_path.resolve())}, ensure_ascii=False, indent=2))
    return 0


def query_task(task_id: str) -> dict[str, Any]:
    encoded = urllib.parse.quote(task_id, safe="")
    response = request_json("GET", f"/minimax/v2/query/video_generation/{encoded}")
    task = response.get("task")
    if not isinstance(task, dict):
        raise H3Error(f"Query response has no task object: {response}")
    return task


def cmd_status(args: argparse.Namespace) -> int:
    task = query_task(args.task_id)
    print(json.dumps(task, ensure_ascii=False, indent=2))
    return 0


def download(url: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".part")
    request = urllib.request.Request(url, headers={"Accept": "video/mp4,*/*"})
    try:
        with urllib.request.urlopen(request, timeout=300) as response, temporary.open("wb") as handle:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
        temporary.replace(output)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def cmd_wait(args: argparse.Namespace) -> int:
    state = read_json(args.state.resolve())
    task_id = state.get("taskId")
    if not isinstance(task_id, str) or not task_id:
        raise H3Error("State file has no taskId")
    output = Path(state.get("output", ""))
    if not output.is_absolute():
        output = (args.state.parent / output).resolve()
    deadline = time.monotonic() + args.timeout
    last_status = None
    while True:
        task = query_task(task_id)
        status = task.get("status")
        if status != last_status:
            print(f"{datetime.now().astimezone().isoformat(timespec='seconds')}  {status}", flush=True)
            last_status = status
        state["status"] = status
        state["updatedAt"] = datetime.now(timezone.utc).isoformat()
        state["task"] = task
        write_json(args.state.resolve(), state)
        if status in TERMINAL_STATUSES:
            break
        if time.monotonic() >= deadline:
            raise H3Error(f"Timed out waiting for task {task_id}; latest status: {status}")
        time.sleep(args.poll)
    if status != "succeeded":
        raise H3Error(f"Task ended with status {status}: {task.get('error')}")
    content = task.get("content")
    url = content.get("url") if isinstance(content, dict) else None
    if not isinstance(url, str) or not url:
        raise H3Error("Succeeded task has no download URL")
    download(url, output)
    state["downloadedAt"] = datetime.now(timezone.utc).isoformat()
    state["downloadedFile"] = str(output)
    write_json(args.state.resolve(), state)
    print(json.dumps({"status": status, "output": str(output)}, ensure_ascii=False, indent=2))
    return 0


def cmd_cancel(args: argparse.Namespace) -> int:
    encoded = urllib.parse.quote(args.task_id, safe="")
    response = request_json("DELETE", f"/minimax/v2/video_generation/{encoded}")
    print(json.dumps(response, ensure_ascii=False, indent=2))
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="CompShare MiniMax H3 API client")
    commands = root.add_subparsers(dest="command", required=True)

    preflight = commands.add_parser("preflight", help="validate a job without using the API")
    preflight.add_argument("--job", required=True, type=Path)
    preflight.set_defaults(func=cmd_preflight)

    submit = commands.add_parser("submit", help="submit a video task")
    submit.add_argument("--job", required=True, type=Path)
    submit.add_argument("--state", type=Path)
    submit.add_argument("--dry-run", action="store_true")
    submit.set_defaults(func=cmd_submit)

    status = commands.add_parser("status", help="query a task")
    status.add_argument("--task-id", required=True)
    status.set_defaults(func=cmd_status)

    wait = commands.add_parser("wait", help="poll a submitted task and download its video")
    wait.add_argument("--state", required=True, type=Path)
    wait.add_argument("--poll", type=int, default=10)
    wait.add_argument("--timeout", type=int, default=3600)
    wait.set_defaults(func=cmd_wait)

    cancel = commands.add_parser("cancel", help="cancel a queued or running task")
    cancel.add_argument("--task-id", required=True)
    cancel.set_defaults(func=cmd_cancel)
    return root


def main() -> int:
    try:
        args = parser().parse_args()
        return args.func(args)
    except H3Error as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

"""
YOLO 하자 탐지 결과 + 원본 이미지를 VLM에 넣어서 종합 진단 리포트를 생성.
YOLO는 "어디에 어떤 하자가 있는지" 탐지만 하고, 등급/점수/판정 근거/이전 진단
대비 변화는 VLM이 이미지와 탐지 결과를 같이 보고 직접 판단한다.

백엔드가 진단 이력을 관리하므로, 이전 진단 기록은 이 모듈이 저장하지 않고
호출할 때 파라미터로 받는다.

모델 교체 가능하도록 MODEL 상수/환경변수로 분리해둠 (지금은 Qwen2.5-VL,
추후 EXAONE 4.5 등으로 교체 예정 - vision 지원 되는 Ollama 모델이면 이름만 바꾸면 됨).

사용법 (단독 테스트):
    python3 vlm_report.py --image photo.jpg
    python3 vlm_report.py --image photo.jpg --weights ../models/handoff/best.pt --previous previous.json
"""
import argparse
import base64
import json
import os
import re
import time
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = os.environ.get("VLM_MODEL", "qwen2.5vl:7b")

GRADES = ["S", "A", "B", "C", "D"]
ITEM_NAMES = ["tear", "scratch", "stain", "wear", "sole_separation", "zipper_damage", "deformation"]
ITEM_LABEL_KO = {
    "tear": "찢어짐", "scratch": "스크래치", "stain": "얼룩/변색", "wear": "마모",
    "sole_separation": "밑창분리", "zipper_damage": "지퍼/버클", "deformation": "형태변형",
}

REPORT_PROMPT = """You are a professional used-luxury-goods condition appraiser inspecting an \
MCM brand item (bag/shoe/accessory) for resale grading.

An object detection model already scanned this image and found these candidate defects \
(location/type/confidence/estimated severity from a segmentation model - use this as supporting \
evidence, but judge the actual photo yourself since the detector can be wrong):
{detections_block}

{previous_block}
Carefully examine the image yourself and produce a condition report. Respond in EXACTLY this \
plain-text format, one item per line, no extra commentary outside this format:

GRADE: <one of S, A, B, C, D - S is flawless/like-new, A is excellent with barely visible wear, \
B is good with minor visible defects, C is fair with noticeable defects, D is poor with major damage>
SCORE_TEAR: <integer 0-100, 100 = no tear damage at all>
SCORE_SCRATCH: <integer 0-100, 100 = no scratches>
SCORE_STAIN: <integer 0-100, 100 = no stains/discoloration>
SCORE_WEAR: <integer 0-100, 100 = no wear/fading>
SCORE_SOLE_SEPARATION: <integer 0-100, 100 = sole fully intact, use 100 if item has no sole>
SCORE_ZIPPER_DAMAGE: <integer 0-100, 100 = hardware/zipper fully intact>
SCORE_DEFORMATION: <integer 0-100, 100 = original shape fully retained>
PROBLEM: <short location like "왼쪽 하단 모서리"> | <defect type in Korean> | <one short sentence detail>
(repeat PROBLEM line for each distinct issue you actually see; omit entirely if none)
RATIONALE: <2-4 Korean sentences explaining why you gave this grade, referencing what you actually observed in the image>
CHANGE: <if previous diagnosis info was given above, 1-3 Korean sentences comparing current condition to it - what got better/worse and where; otherwise write exactly NONE>
"""

DETECTION_LINE = "- {type} (conf {conf:.2f}, severity {severity}, area {area_pct:.1f}% of item, bbox {bbox})"


def _build_detections_block(defects: list) -> str:
    if not defects:
        return "(탐지된 하자 없음 - detector found no defects)"
    lines = [
        DETECTION_LINE.format(
            type=d["type"], conf=d["confidence"], severity=d["severity_label"],
            area_pct=d["area_ratio"] * 100, bbox=d["bbox"],
        )
        for d in defects
    ]
    return "\n".join(lines)


def _build_previous_block(previous_diagnoses: list) -> str:
    if not previous_diagnoses:
        return ""
    last = previous_diagnoses[-1]
    parts = [f"Most recent previous diagnosis (date: {last.get('date', '알수없음')}): "
             f"grade {last.get('overall_grade', '?')}, overall score {last.get('overall_score', '?')}."]
    prob = last.get("problem_areas")
    if prob:
        prob_str = "; ".join(
            f"{p.get('location', '?')} ({p.get('type', '?')})" for p in prob[:5]
        )
        parts.append(f"Previously noted problem areas: {prob_str}.")
    parts.append("Compare the current photo against this previous record for the CHANGE field.\n")
    return " ".join(parts)


def _encode_image(image_path: str) -> str:
    return base64.b64encode(Path(image_path).read_bytes()).decode()


def query_ollama(image_path: str, prompt: str, retries: int = 3) -> str:
    b64 = _encode_image(image_path)
    payload = json.dumps({
        "model": MODEL,
        "prompt": prompt,
        "images": [b64],
        "stream": False,
        "keep_alive": 0,
    }).encode()

    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                OLLAMA_URL, data=payload, headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=180) as resp:
                return json.loads(resp.read().decode()).get("response", "")
        except Exception as e:
            last_err = e
            time.sleep(5 * (attempt + 1))
    raise last_err


def _parse_int(text: str, default: int = 50) -> int:
    m = re.search(r"-?\d+", text)
    if not m:
        return default
    return max(0, min(100, int(m.group())))


def parse_report_text(text: str) -> dict:
    grade_m = re.search(r"GRADE:\s*([SABCD])", text, re.IGNORECASE)
    overall_grade = grade_m.group(1).upper() if grade_m else "C"

    item_scores = {}
    for name in ITEM_NAMES:
        m = re.search(rf"SCORE_{name.upper()}:\s*(-?\d+)", text)
        item_scores[name] = _parse_int(m.group(1)) if m else 50

    problem_areas = []
    for m in re.finditer(r"PROBLEM:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)(?:\n|$)", text):
        problem_areas.append({
            "location": m.group(1).strip(),
            "type": m.group(2).strip(),
            "detail": m.group(3).strip(),
        })

    rationale_m = re.search(r"RATIONALE:\s*(.+?)(?:\nCHANGE:|$)", text, re.DOTALL)
    rationale = rationale_m.group(1).strip() if rationale_m else ""

    change_m = re.search(r"CHANGE:\s*(.+?)$", text, re.DOTALL)
    change_text = change_m.group(1).strip() if change_m else "NONE"
    if change_text.upper().startswith("NONE"):
        change_text = None

    return {
        "overall_grade": overall_grade,
        "item_scores": item_scores,
        "problem_areas": problem_areas,
        "rationale": rationale,
        "change_text": change_text,
    }


def generate_report(image_path: str, defects: list, previous_diagnoses: list = None) -> dict:
    previous_diagnoses = previous_diagnoses or []

    prompt = REPORT_PROMPT.format(
        detections_block=_build_detections_block(defects),
        previous_block=_build_previous_block(previous_diagnoses),
    )
    raw_text = query_ollama(image_path, prompt)
    parsed = parse_report_text(raw_text)

    overall_score = round(sum(parsed["item_scores"].values()) / len(parsed["item_scores"]), 1)

    grade_change = None
    if previous_diagnoses:
        last = previous_diagnoses[-1]
        prev_score = last.get("overall_score")
        score_delta = round(overall_score - prev_score, 1) if isinstance(prev_score, (int, float)) else None
        grade_change = {
            "previous_grade": last.get("overall_grade"),
            "previous_score": prev_score,
            "current_grade": parsed["overall_grade"],
            "current_score": overall_score,
            "score_delta": score_delta,
            "description": parsed["change_text"],
        }

    trend = [
        {
            "date": d.get("date"),
            "overall_grade": d.get("overall_grade"),
            "overall_score": d.get("overall_score"),
        }
        for d in previous_diagnoses
    ]
    trend.append({"date": "current", "overall_grade": parsed["overall_grade"], "overall_score": overall_score})

    return {
        "overall_grade": parsed["overall_grade"],
        "overall_score": overall_score,
        "item_scores": parsed["item_scores"],
        "item_scores_label_ko": {ITEM_LABEL_KO[k]: v for k, v in parsed["item_scores"].items()},
        "problem_areas": parsed["problem_areas"],
        "rationale": parsed["rationale"],
        "grade_change": grade_change,
        "trend": trend,
        "defects": defects,
        "model": MODEL,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--weights", default=str(SCRIPT_DIR / "../models/handoff/best.pt"))
    parser.add_argument("--previous", default=None, help="이전 진단 기록 JSON 파일 (리스트, 오래된 순)")
    args = parser.parse_args()

    import infer as infer_mod
    result, _ = infer_mod.run(args.image, args.weights)

    previous_diagnoses = []
    if args.previous:
        previous_diagnoses = json.loads(Path(args.previous).read_text(encoding="utf-8"))

    report = generate_report(args.image, result["defects"], previous_diagnoses)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

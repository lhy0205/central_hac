"""
학습된 모델로 이미지 하나를 분석해 하자 위치·심각도·수리 권장사항을 출력.

사용법:
    python3 infer.py --image path/to/photo.jpg
    python3 infer.py --image path/to/photo.jpg --weights ./best.pt
    python3 infer.py --image path/to/photo.jpg --save-image result.jpg   # 박스 그려서 이미지로 저장
"""
import argparse

import numpy as np
import json
import os
from pathlib import Path

import cv2
import yaml
from ultralytics import YOLO

SCRIPT_DIR = Path(__file__).parent

SEVERITY_COLOR_BGR = {
    "severe": (60, 60, 230),    # 빨강
    "moderate": (30, 160, 240), # 주황
    "minor": (60, 200, 60),     # 초록
}


def load_rules():
    with open(SCRIPT_DIR / "classes.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def assess_severity(class_name: str, area_ratio: float, rules: dict) -> dict:
    bias = rules.get("class_severity_bias", {}).get(class_name, 1.0)
    adjusted = area_ratio * bias

    for level in ("minor", "moderate", "severe"):
        rule = rules["severity_rules"][level]
        if adjusted <= rule["max_area_ratio"]:
            return {"level": level, "label": rule["label"], "repair": rule["repair"]}
    severe = rules["severity_rules"]["severe"]
    return {"level": "severe", "label": severe["label"], "repair": severe["repair"]}



def _polygon_area(polygon):
    """마스크 폴리곤(shape (N,2))의 면적을 구두끈 공식으로 계산한다.

    ultralytics의 masks.xy는 이미 원본 이미지 좌표계의 꼭짓점 배열이라 그대로 쓸 수 있다.
    점이 3개 미만이면 면적이 정의되지 않으므로 0을 돌려준다.
    """
    if polygon is None or len(polygon) < 3:
        return 0.0
    x = polygon[:, 0]
    y = polygon[:, 1]
    return float(abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))) / 2.0)

def run(image_path: str, weights: str = None, model: YOLO = None):
    """weights(경로) 또는 이미 로드된 model 객체 중 하나를 받음.
    API 서버처럼 반복 호출하는 경우 model을 한 번만 로드해서 재사용하는 용도."""
    rules = load_rules()
    if model is None:
        model = YOLO(weights)
    results = model(image_path)[0]

    if results.masks is None or len(results.masks) == 0:
        return {"image": image_path, "defects": [], "summary": "탐지된 하자 없음"}, results

    img_h, img_w = results.orig_shape
    # 분모는 이미지 전체 면적이다. classes.yaml은 "제품 전체 바운딩박스 면적"이라고
    # 적어두었지만, 이 모델은 하자만 탐지하고 제품 자체는 탐지하지 않아 제품 박스를
    # 구할 방법이 없다. 촬영 가이드가 제품이 화면을 채우도록 유도하므로 근사로 쓴다.
    #
    # 주의: 그래서 area_ratio는 카메라 거리에 영향을 받는다(멀리서 찍으면 작아진다).
    # classes.yaml의 임계값(0.03/0.10)은 제품 박스 기준으로 잡힌 값이라 이 분모와는
    # 스케일이 맞지 않는다 — 실제 사진으로 재보정이 필요하다(AI 파트 확인 필요).
    full_area = img_h * img_w

    defects = []
    for i, (mask, box, cls_id, conf) in enumerate(zip(
        results.masks.xy, results.boxes.xyxy, results.boxes.cls, results.boxes.conf
    )):
        class_name = results.names[int(cls_id)]
        x1, y1, x2, y2 = box.tolist()
        # 분자는 세그멘테이션 마스크 면적을 쓴다. 바운딩박스 면적을 쓰면 길쭉한 하자
        # (스크래치·찢어짐·밑창분리)가 크게 부풀려진다 — 예를 들어 대각선 방향의 가는
        # 스크래치는 마스크가 얇아도 박스는 그 대각선을 감싸는 큰 사각형이 된다.
        # 마스크는 이미 계산돼 있었고 그리기(draw_annotated)에만 쓰이고 있었다.
        area_ratio = _polygon_area(mask) / full_area

        severity = assess_severity(class_name, area_ratio, rules)
        defects.append({
            "index": i,
            "type": class_name,
            "confidence": round(float(conf), 3),
            "bbox": [round(v, 1) for v in (x1, y1, x2, y2)],
            "area_ratio": round(area_ratio, 4),
            "severity": severity["level"],
            "severity_label": severity["label"],
            "repair_recommendation": severity["repair"],
        })

    defects.sort(key=lambda d: {"severe": 0, "moderate": 1, "minor": 2}[d["severity"]])

    return {
        "image": image_path,
        "defects": defects,
        "summary": f"{len(defects)}개 하자 탐지됨, 최고 심각도: {defects[0]['severity_label']}",
    }, results


def draw_annotated(image_path: str, result: dict, results, out_path: str):
    img = cv2.imread(image_path)
    for d in result["defects"]:
        x1, y1, x2, y2 = (int(v) for v in d["bbox"])
        color = SEVERITY_COLOR_BGR[d["severity"]]
        mask_xy = results.masks.xy[d["index"]]
        pts = mask_xy.astype(int).reshape(-1, 1, 2)

        overlay = img.copy()
        cv2.fillPoly(overlay, [pts], color)
        img = cv2.addWeighted(overlay, 0.30, img, 0.70, 0)
        cv2.polylines(img, [pts], isClosed=True, color=color, thickness=2)

        label = f"{d['type']} ({d['severity_label']}) {d['confidence']:.2f}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        cv2.rectangle(img, (x1, y1 - th - 8), (x1 + tw + 8, y1), color, -1)
        cv2.putText(img, label, (x1 + 4, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)

    if not result["defects"]:
        cv2.putText(img, "no defects detected", (16, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA)

    cv2.imwrite(out_path, img)
    return out_path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument(
        "--weights", default=str(SCRIPT_DIR / "best.pt")
    )
    parser.add_argument(
        "--save-image", default=None,
        help="박스/마스크를 그려서 저장할 경로 (지정 안 하면 <이미지명>_result.jpg)"
    )
    parser.add_argument("--no-image", action="store_true", help="이미지 저장 없이 JSON만 출력")
    args = parser.parse_args()

    if not Path(args.weights).exists():
        raise SystemExit(
            f"학습된 가중치가 없습니다: {args.weights}\n"
            "먼저 train.py로 모델을 학습하세요."
        )

    result, results = run(args.image, args.weights)
    print(json.dumps(result, ensure_ascii=False, indent=2))

    if not args.no_image:
        default_name = Path(args.image).stem + "_result.jpg"
        if args.save_image is None:
            out_path = Path(args.image).with_name(default_name)
        else:
            out_path = Path(args.save_image)
            if out_path.is_dir() or args.save_image.endswith(("/", os.sep)):
                out_path = out_path / default_name
            elif out_path.suffix == "":
                out_path = out_path.with_suffix(".jpg")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        draw_annotated(args.image, result, results, str(out_path))
        print(f"\n결과 이미지 저장: {out_path}")


if __name__ == "__main__":
    main()

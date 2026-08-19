# AR 제품 인식 서버 (YOLOv8n 탐지 + DINOv2/ArcFace 식별, 730 SKU 갤러리).
# 모델 가중치(best.pt 347MB 등)는 Git LFS로 추적되므로, 빌드 전에 `git lfs pull`이 끝나 있어야 한다.
# 포인터 파일만 있는 상태로 빌드하면 런타임에 torch.load가 실패한다.
FROM python:3.11-slim

# ultralytics(OpenCV)가 요구하는 런타임 라이브러리. slim 이미지에는 없다.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# torch는 기본 인덱스에서 받으면 CUDA 런타임까지 딸려와 이미지가 수 GB 커진다.
# 이 서버는 CPU 추론만 하므로 CPU 전용 휠을 쓴다.
COPY requirements.txt requirements_api.txt ./
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch torchvision \
    && pip install --no-cache-dir -r requirements_api.txt

# DINOv2 아키텍처 코드는 torch.hub가 GitHub에서 받아온다(HANDOFF.md 한계 3번).
# 빌드 시점에 미리 캐시해두어야 폐쇄망/오프라인 런타임에서도 기동한다.
RUN python -c "import torch; torch.hub.load('facebookresearch/dinov2', 'dinov2_vitb14')"

COPY . .

EXPOSE 8001
CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "8001"]

# 하자 탐지 서버 (YOLO11l-seg, 7클래스). Spring의 MlWearDiagnosisEngine이 호출한다.
# best.pt(56MB)는 Git LFS로 추적되므로 빌드 전에 `git lfs pull`이 끝나 있어야 한다.
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ultralytics가 torch를 끌어오는데, 기본 인덱스로는 CUDA 런타임까지 딸려와 이미지가 수 GB 커진다.
# CPU 추론만 하므로 CPU 전용 torch를 먼저 깔아 그 의존성을 고정한다.
COPY requirements_api.txt ./
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch torchvision \
    && pip install --no-cache-dir -r requirements_api.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "8000"]

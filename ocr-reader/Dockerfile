# OCR 서버 (PaddleOCR). 시리얼/제품 코드 인식으로 정품 인증을 보조한다.
# requirements_api.txt가 기본으로 GPU 빌드(paddlepaddle-gpu)를 까므로, GPU+nvidia container
# runtime이 있는 호스트에서 돌리는 걸 전제로 한다. CPU 전용 배포면 requirements_api.txt의
# 상단 두 줄(--extra-index-url, paddlepaddle-gpu)을 지우고 `paddlepaddle`로 바꿀 것 —
# CPU에서는 실사진 한 장에 1분 이상 걸릴 수 있음(README 참고).
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements_api.txt ./
RUN pip install --no-cache-dir -r requirements_api.txt

COPY . .

EXPOSE 8002
CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "8002"]

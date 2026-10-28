# BiZik KYC image analyzer.
#
# Ships with the two OpenCV Zoo models baked in, so the container never needs
# network access at runtime and a deploy can't silently produce a service that
# scores nothing. The download is verified by size: GitHub serves a small
# pointer file for LFS objects fetched from the wrong URL, and a pointer file
# would load as a broken model.
FROM python:3.11-slim AS models

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /models
ARG ZOO=https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models
RUN curl -fsSL -o face_detection_yunet_2023mar.onnx \
      "${ZOO}/face_detection_yunet/face_detection_yunet_2023mar.onnx" \
 && curl -fsSL -o face_recognition_sface_2021dec.onnx \
      "${ZOO}/face_recognition_sface/face_recognition_sface_2021dec.onnx" \
 && test "$(stat -c%s face_detection_yunet_2023mar.onnx)" -ge 100000 \
 && test "$(stat -c%s face_recognition_sface_2021dec.onnx)" -ge 1000000

FROM python:3.11-slim

# libGL/libglib are needed by OpenCV even in its headless build.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY --from=models /models /app/models
COPY app ./app

# Runs unprivileged: this service parses untrusted images from the internet.
RUN useradd --create-home --uid 10001 analyzer && chown -R analyzer /app
USER analyzer

ENV KYC_MODEL_DIR=/app/models
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

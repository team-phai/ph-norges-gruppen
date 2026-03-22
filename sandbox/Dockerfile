# Sandbox runner image — mirrors competition environment exactly.
# CUDA 12.4 + Python 3.11 + all pre-installed packages at pinned versions.

FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV YOLO_OFFLINE=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# System deps + Python 3.11 via deadsnakes
RUN apt-get update && apt-get install -y --no-install-recommends \
        software-properties-common \
        libgl1-mesa-glx \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender-dev \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        python3.11 \
        python3.11-venv \
        python3.11-dev \
        python3.11-distutils \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 \
    && update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# pip
RUN python -m ensurepip --upgrade && python -m pip install --upgrade pip

# PyTorch 2.6.0+cu124 (separate layer for caching)
RUN pip install --no-cache-dir \
    torch==2.6.0+cu124 \
    torchvision==0.21.0+cu124 \
    --index-url https://download.pytorch.org/whl/cu124

# All other sandbox packages at exact pinned versions
RUN pip install --no-cache-dir \
    ultralytics==8.1.0 \
    onnxruntime-gpu==1.20.0 \
    opencv-python-headless==4.9.0.80 \
    albumentations==1.3.1 \
    Pillow==10.2.0 \
    numpy==1.26.4 \
    scipy==1.12.0 \
    scikit-learn==1.4.0 \
    pycocotools==2.0.7 \
    ensemble-boxes==1.0.9 \
    timm==0.9.12 \
    supervision==0.18.0 \
    safetensors==0.4.2

# Working directories
RUN mkdir -p /submission /data/images /output

WORKDIR /submission

# Entry point: run the submission's run.py
ENTRYPOINT ["python", "run.py", "--input", "/data/images", "--output", "/output/predictions.json"]

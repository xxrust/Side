#!/usr/bin/env python3
"""Decode genuine input bytes for the headless Workspace import API; never creates images."""
import base64, hashlib, io, json, sys
from PIL import Image, ImageOps
raw = sys.stdin.buffer.read()
with Image.open(io.BytesIO(raw)) as original:
    image = ImageOps.exif_transpose(original).convert('RGBA')
    if image.width * image.height > 16000000:
        raise ValueError('Workspace image exceeds 16 megapixels')
    canvas = Image.new('RGBA', image.size, (255, 255, 255, 255))
    rgba = Image.alpha_composite(canvas, image).tobytes()
    print(json.dumps({'width':image.width,'height':image.height,'rgba':base64.b64encode(rgba).decode(),'sha256':hashlib.sha256(rgba).hexdigest(),'contentSha256':hashlib.sha256(raw).hexdigest(),'decoder':{'representation':'python-pillow-rgba8','version':Image.__version__,'alphaCompositing':'white','exifOrientation':'transposed'}}))

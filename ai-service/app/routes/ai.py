import cv2
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.processing.compare import compare_images
from app.processing.complementary import complementary_view
from app.processing.completeness import assess_completeness
from app.processing.reconstruct import reconstruct
from app.processing.restore import restore_image
from app.processing.segment3d import segment_volume
from app.processing.synthetic import MAX_SYNTHETIC_SEED, generate_synthetic

router = APIRouter()
MAX_SINGLE_UPLOAD_BYTES = 32 * 1024 * 1024
MAX_VOLUME_UPLOAD_BYTES = 128 * 1024 * 1024
MAX_VOLUME_SLICES = 200


async def read_required(upload: UploadFile | None, name: str) -> bytes:
    if upload is None:
        raise HTTPException(status_code=400, detail=f"{name} is required.")
    data = await upload.read(MAX_SINGLE_UPLOAD_BYTES + 1)
    if len(data) > MAX_SINGLE_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"{name} exceeds the upload size limit.")
    if not data:
        raise HTTPException(status_code=400, detail=f"{name} is empty.")
    return data


def run_processing(function, *args):
    try:
        return function(*args)
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error) or "Image data is malformed or unsupported.",
        ) from error
    except (OSError, cv2.error) as error:
        raise HTTPException(status_code=400, detail="Image data is malformed or unsupported.") from error


@router.post("/restore")
async def restore(image: UploadFile = File(...)):
    return run_processing(restore_image, await read_required(image, "image"))


@router.post("/completeness-check")
async def completeness(image: UploadFile = File(...), exam_type: str = Form(""), body_part: str = Form("")):
    return run_processing(assess_completeness, await read_required(image, "image"), exam_type or body_part)


@router.post("/compare")
async def compare(
    image: UploadFile = File(...),
    prior_image: UploadFile = File(...),
):
    return run_processing(
        compare_images,
        await read_required(image, "image"),
        await read_required(prior_image, "prior_image"),
    )


@router.post("/reconstruct")
async def reconstruct_anatomy(
    image: UploadFile = File(...),
    prior_image: UploadFile = File(...),
):
    return run_processing(
        reconstruct,
        await read_required(image, "image"),
        await read_required(prior_image, "prior_image"),
    )


@router.post("/segment-3d")
async def segment(volume: list[UploadFile] = File(default=[])):
    if not volume:
        raise HTTPException(status_code=400, detail="A CT/MR series (volume files) is required.")
    if len(volume) > MAX_VOLUME_SLICES:
        raise HTTPException(status_code=413, detail=f"A volume may contain at most {MAX_VOLUME_SLICES} slices.")
    blobs = []
    total_bytes = 0
    for item in volume:
        blob = await read_required(item, "volume slice")
        total_bytes += len(blob)
        if total_bytes > MAX_VOLUME_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="The volume exceeds the total upload size limit.")
        blobs.append(blob)
    return run_processing(segment_volume, blobs)


@router.post("/generate-synthetic")
async def synthetic(notes: str = Form("7")):
    seed_text = str(notes).strip()
    if seed_text.lstrip("+-").isdigit() and seed_text not in ("+", "-"):
        try:
            seed = int(seed_text)
        except ValueError as error:
            raise HTTPException(
                status_code=400,
                detail=f"Seed must be between 0 and {MAX_SYNTHETIC_SEED}.",
            ) from error
        if seed < 0 or seed > MAX_SYNTHETIC_SEED:
            raise HTTPException(status_code=400, detail=f"Seed must be between 0 and {MAX_SYNTHETIC_SEED}.")
    else:
        seed = 7
    return generate_synthetic(seed)


@router.post("/generate-complementary-view")
async def complementary(image: UploadFile = File(...)):
    return run_processing(complementary_view, await read_required(image, "image"))

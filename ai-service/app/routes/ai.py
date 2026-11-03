from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.processing.compare import compare_images
from app.processing.complementary import complementary_view
from app.processing.completeness import assess_completeness
from app.processing.reconstruct import reconstruct
from app.processing.restore import restore_image
from app.processing.segment3d import segment_volume
from app.processing.synthetic import generate_synthetic

router = APIRouter()


async def read_required(upload: UploadFile | None, name: str) -> bytes:
    if upload is None:
        raise HTTPException(status_code=400, detail=f"{name} is required.")
    data = await upload.read()
    if not data:
        raise HTTPException(status_code=400, detail=f"{name} is empty.")
    return data


@router.post("/restore")
async def restore(image: UploadFile = File(...)):
    return restore_image(await read_required(image, "image"))


@router.post("/completeness-check")
async def completeness(image: UploadFile = File(...), exam_type: str = Form(""), body_part: str = Form("")):
    return assess_completeness(await read_required(image, "image"), exam_type or body_part)


@router.post("/compare")
async def compare(
    image: UploadFile = File(...),
    prior_image: UploadFile = File(...),
):
    return compare_images(
        await read_required(image, "image"),
        await read_required(prior_image, "prior_image"),
    )


@router.post("/reconstruct")
async def reconstruct_anatomy(
    image: UploadFile = File(...),
    prior_image: UploadFile = File(...),
):
    return reconstruct(
        await read_required(image, "image"),
        await read_required(prior_image, "prior_image"),
    )


@router.post("/segment-3d")
async def segment(volume: list[UploadFile] = File(default=[])):
    if not volume:
        raise HTTPException(status_code=400, detail="A CT/MR series (volume files) is required.")
    blobs = [await item.read() for item in volume]
    return segment_volume(blobs)


@router.post("/generate-synthetic")
async def synthetic(notes: str = Form("7")):
    try:
        seed = int(notes) if str(notes).isdigit() else 7
    except ValueError:
        seed = 7
    return generate_synthetic(seed)


@router.post("/generate-complementary-view")
async def complementary(image: UploadFile = File(...)):
    return complementary_view(await read_required(image, "image"))

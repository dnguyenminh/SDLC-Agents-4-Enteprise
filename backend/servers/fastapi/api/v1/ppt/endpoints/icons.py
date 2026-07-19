from typing import List

from fastapi import APIRouter, Query
from services.icon_finder_service import ICON_FINDER_SERVICE
from utils.icon_weights import DEFAULT_ICON_WEIGHT, normalize_icon_weight

ICONS_ROUTER = APIRouter(prefix="/icons", tags=["Icons"])


@ICONS_ROUTER.get("/search", response_model=List[str])
async def search_icons(
    query: str,
    limit: int = 20,
    icon_weight: str = Query(default=DEFAULT_ICON_WEIGHT),
):
    return await ICON_FINDER_SERVICE.search_icons(
        query,
        limit,
        weight=normalize_icon_weight(icon_weight),
    )

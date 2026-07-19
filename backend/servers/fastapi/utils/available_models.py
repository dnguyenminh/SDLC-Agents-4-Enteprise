import aiohttp
from openai import AsyncOpenAI
from google import genai


def normalize_openai_compatible_base_url(url: str) -> str:
    """Ensure base URL targets the OpenAI-compatible /v1 root (LiteLLM, vLLM, etc.)."""
    u = (url or "").strip().rstrip("/")
    if not u:
        return u
    if u.endswith("/v1"):
        return u
    base = u.split("?", 1)[0]
    if "/v1" in base:
        return u
    return f"{u}/v1"


def is_together_api_base_url(url: str) -> bool:
    normalized = normalize_openai_compatible_base_url(url).lower()
    return "api.together.ai" in normalized or "api.together.xyz" in normalized


def _model_ids_from_openai_compatible_payload(data: object) -> list[str]:
    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        items = data.get("data", [])
        if not isinstance(items, list):
            return []
    else:
        return []

    model_ids: list[str] = []
    for item in items:
        if isinstance(item, str) and item:
            model_ids.append(item)
            continue
        if not isinstance(item, dict):
            continue
        model_id = item.get("id") or item.get("name")
        if isinstance(model_id, str) and model_id:
            model_ids.append(model_id)
    return model_ids


async def list_together_models(url: str, api_key: str) -> list[str]:
    """
    Together's /v1/models payload is not always parsed by the OpenAI Python SDK
    (which expects a paginated object and calls _set_private_attributes on it).
    """
    base_url = normalize_openai_compatible_base_url(url)
    models_url = f"{base_url.rstrip('/')}/models"
    headers = {"Authorization": f"Bearer {(api_key or '').strip()}"}

    async with aiohttp.ClientSession(headers=headers) as session:
        async with session.get(models_url) as response:
            response.raise_for_status()
            data = await response.json()

    return _model_ids_from_openai_compatible_payload(data)


async def list_available_openai_compatible_models(url: str, api_key: str) -> list[str]:
    url = normalize_openai_compatible_base_url(url)
    if is_together_api_base_url(url):
        return await list_together_models(url, api_key)

    # Local LiteLLM / OpenAI-compatible proxies often omit auth; SDK rejects a blank key.
    effective_key = (api_key or "").strip() or "EMPTY"
    client = AsyncOpenAI(api_key=effective_key, base_url=url)
    models = (await client.models.list()).data
    if models:
        return [m.id for m in models if m.id]
    return []


async def list_available_anthropic_models(api_key: str) -> list[str]:
    async with aiohttp.ClientSession(
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        }
    ) as session:
        async with session.get(
            "https://api.anthropic.com/v1/models",
            params={"limit": 50},
        ) as response:
            response.raise_for_status()
            data = await response.json()

    models = data.get("data", [])
    return [model.get("id") for model in models if model.get("id")]


async def list_available_google_models(api_key: str) -> list[str]:
    client = genai.Client(api_key=api_key)
    return [x.name for x in client.models.list(config={"page_size": 50}) if x.name]

from utils.available_models import (
    _model_ids_from_openai_compatible_payload,
    is_together_api_base_url,
    normalize_openai_compatible_base_url,
)


def test_is_together_api_base_url():
    assert is_together_api_base_url("https://api.together.ai/v1")
    assert is_together_api_base_url("https://api.together.xyz")
    assert not is_together_api_base_url("https://api.fireworks.ai/inference/v1")


def test_model_ids_from_openai_compatible_payload_openai_shape():
    payload = {
        "data": [
            {"id": "meta-llama/Llama-3-8b-chat-hf"},
            {"name": "legacy-name"},
        ]
    }
    assert _model_ids_from_openai_compatible_payload(payload) == [
        "meta-llama/Llama-3-8b-chat-hf",
        "legacy-name",
    ]


def test_model_ids_from_openai_compatible_payload_top_level_list():
    payload = [
        {"id": "openai/gpt-oss-20b"},
        {"id": "meta-llama/Llama-3-8b-chat-hf"},
    ]
    assert _model_ids_from_openai_compatible_payload(payload) == [
        "openai/gpt-oss-20b",
        "meta-llama/Llama-3-8b-chat-hf",
    ]


def test_normalize_openai_compatible_base_url_appends_v1():
    assert (
        normalize_openai_compatible_base_url("https://api.together.ai")
        == "https://api.together.ai/v1"
    )

"""Gemini client factory and tool-call execution loop.

Wraps ``google.generativeai`` with:
  • Lazy client initialisation (cached after first call).
  • Automatic tool-call dispatch loop (up to LLM_MAX_TOOL_ITERATIONS).
  • Graceful degradation when GEMINI_API_KEY is not set (returns None).
"""
from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from typing import Any, Callable

log = logging.getLogger(__name__)

# Lazy-imported at runtime to keep import-time cheap.
_genai = None


def _ensure_genai():
    global _genai
    if _genai is None:
        import google.generativeai as genai
        _genai = genai
    return _genai


def _api_key() -> str | None:
    return os.environ.get("GEMINI_API_KEY")


def _model_name() -> str:
    return os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")


def _max_iterations() -> int:
    return int(os.environ.get("LLM_MAX_TOOL_ITERATIONS", "6"))


@lru_cache(maxsize=1)
def _configure():
    """Configure the SDK once. Returns True if a key was present."""
    key = _api_key()
    if not key:
        return False
    genai = _ensure_genai()
    genai.configure(api_key=key)
    return True


def is_available() -> bool:
    """Return True when a Gemini API key is configured."""
    return _configure()


def chat_with_tools(
    system_prompt: str,
    user_message: str,
    bound_tools: dict[str, Callable],
    tool_declarations: list[dict],
    history: list[dict] | None = None,
) -> str | None:
    """Run a single conversational turn with tool-call support.

    Parameters
    ----------
    system_prompt : str
        System instruction for Gemini.
    user_message : str
        The user's latest message.
    bound_tools : dict[str, Callable]
        Mapping of tool-name → Python callable (pre-bound to tenant context).
    tool_declarations : list[dict]
        Schema declarations Gemini uses to decide when to call a tool.
    history : list[dict] | None
        Previous conversation turns. Each dict has ``role`` ("user"|"model")
        and ``parts`` (list of text strings).

    Returns
    -------
    str | None
        The model's final text response, or None if Gemini is unavailable.
    """
    if not is_available():
        return None

    genai = _ensure_genai()

    # Build tool config.
    tools = None
    if tool_declarations:
        tools = [genai.types.Tool(function_declarations=[
            genai.types.FunctionDeclaration(**decl) for decl in tool_declarations
        ])]

    model = genai.GenerativeModel(
        model_name=_model_name(),
        system_instruction=system_prompt,
        tools=tools,
    )

    # Build conversation history. Accept several common shapes:
    #   {"role": "user|model|teco|assistant", "parts": [str, ...]}
    #   {"role": ..., "content": str}
    #   {"role": ..., "text": str}
    contents = []
    if history:
        for turn in history:
            role = (turn.get("role") or "user").lower()
            if role in ("teco", "assistant", "bot"):
                role = "model"
            elif role not in ("user", "model", "function"):
                role = "user"

            if "parts" in turn and isinstance(turn["parts"], list):
                texts = [str(p) for p in turn["parts"] if p is not None]
            elif "content" in turn and turn["content"] is not None:
                texts = [str(turn["content"])]
            elif "text" in turn and turn["text"] is not None:
                texts = [str(turn["text"])]
            else:
                continue  # skip turns we cannot parse

            contents.append(genai.types.ContentDict(
                role=role,
                parts=[genai.types.PartDict(text=t) for t in texts],
            ))
    contents.append(genai.types.ContentDict(
        role="user",
        parts=[genai.types.PartDict(text=user_message)],
    ))

    max_iter = _max_iterations()
    for iteration in range(max_iter):
        response = model.generate_content(contents)

        # Check for function calls in the response.
        candidate = response.candidates[0]
        function_calls = []
        text_parts = []

        for part in candidate.content.parts:
            if hasattr(part, "function_call") and part.function_call:
                function_calls.append(part.function_call)
            elif hasattr(part, "text") and part.text:
                text_parts.append(part.text)

        if not function_calls:
            # No more tool calls — return the text.
            return "\n".join(text_parts) if text_parts else ""

        # Execute each function call and feed results back.
        contents.append(candidate.content)

        function_responses = []
        for fc in function_calls:
            fname = fc.name
            args = dict(fc.args) if fc.args else {}
            log.info("Gemini tool call [iter %d]: %s(%s)", iteration, fname, args)

            if fname in bound_tools:
                result = bound_tools[fname](**args)
            else:
                result = {"error": f"Unknown tool: {fname}"}

            function_responses.append(
                genai.types.PartDict(
                    function_response={
                        "name": fname,
                        "response": result,
                    }
                )
            )

        contents.append(genai.types.ContentDict(
            role="function",
            parts=function_responses,
        ))

    # Exhausted iterations — return whatever text we have.
    return "I gathered a lot of data but ran out of reasoning steps. Please ask a more specific question."


def generate_text(
    system_prompt: str,
    user_message: str,
) -> str | None:
    """Simple text generation (no tools). Returns None if unavailable."""
    if not is_available():
        return None

    genai = _ensure_genai()
    model = genai.GenerativeModel(
        model_name=_model_name(),
        system_instruction=system_prompt,
    )
    response = model.generate_content(user_message)
    return response.text

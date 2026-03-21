"""
bedrock_client.py — shared Bedrock client + tool-use helpers
Drop this in ml/agents/ alongside the agent files.

Authentication (in priority order):
  1. AWS_BEARER_TOKEN_BEDROCK  ← Bedrock long-term API key (recommended for dev)
     Generate at: AWS Console → Amazon Bedrock → API keys → Generate long-term API key
  2. AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY  ← IAM user keys
  3. ~/.aws/credentials or EC2/ECS instance role  ← AWS standard chain

.env is loaded from the ml/ directory (one level above this file) so it works
regardless of whether you run the agent from ml/ or ml/agents/.
"""

import boto3
import os
from pathlib import Path
from dotenv import load_dotenv

# Load ml/.env (parent directory of this file's directory)
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

# ── Model IDs ─────────────────────────────────────────────────────────────────
# US cross-region inference profiles — routes to best available region.
# Change to "eu." prefix if your AWS account is EU-based.

MODEL_SONNET = "amazon.nova-pro-v1:0"  # Alternatives for Agents 1 & 2
MODEL_HAIKU = "amazon.nova-lite-v1:0"  # Fast Alternative for Agent 3

# ── Client factory ────────────────────────────────────────────────────────────


def make_client():
    """
    Returns a bedrock-runtime boto3 client.

    Credentials resolution order:
      1. AWS_BEARER_TOKEN_BEDROCK env var  ← Bedrock long-term or short-term API key
      2. AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY  ← IAM user keys
      3. ~/.aws/credentials or EC2/ECS role (boto3 default chain)
    """
    region = os.getenv("AWS_REGION", "us-east-1")

    bearer_token = os.getenv("AWS_BEARER_TOKEN_BEDROCK")
    access_key = os.getenv("AWS_ACCESS_KEY_ID")
    secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")

    # Validate that at least one credential source is configured
    aws_creds_file = Path.home() / ".aws" / "credentials"
    has_creds = (
        bearer_token is not None
        or (access_key and secret_key)
        or aws_creds_file.exists()
    )
    if not has_creds:
        raise EnvironmentError(
            "\n❌ No AWS credentials found. Set one of:\n"
            "  • AWS_BEARER_TOKEN_BEDROCK (recommended) — in ml/.env\n"
            "  • AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY — in ml/.env\n"
            "  • ~/.aws/credentials file\n\n"
            "To get a long-term API key:\n"
            "  AWS Console → Amazon Bedrock → API keys → Generate long-term API key"
        )

    session_kwargs = {"region_name": region}

    # If we have an IAM key pair, pass them explicitly; otherwise let boto3
    # pick up credentials from its standard chain (includes bearer token env var).
    if access_key and secret_key:
        session_kwargs["aws_access_key_id"] = access_key
        session_kwargs["aws_secret_access_key"] = secret_key
        session_token = os.getenv("AWS_SESSION_TOKEN")
        if session_token:
            session_kwargs["aws_session_token"] = session_token

    session = boto3.Session(**session_kwargs)
    client = session.client("bedrock-runtime")

    if bearer_token:
        print(f"🔑 Using Bedrock API key (AWS_BEARER_TOKEN_BEDROCK) — region={region}")
    elif access_key:
        print(f"🔑 Using IAM keys (AWS_ACCESS_KEY_ID) — region={region}")
    else:
        print(f"🔑 Using ~/.aws/credentials or instance role — region={region}")

    return client


# ── Tool format conversion ────────────────────────────────────────────────────
# Bedrock wraps every tool definition in a "toolSpec" key.
# This helper converts our Anthropic-SDK-style tool dicts to Bedrock format.


def to_bedrock_tools(tools: list) -> list:
    """
    Convert Anthropic SDK tool format → Bedrock converse API format.

    Anthropic SDK:
      {"name": "foo", "description": "...", "input_schema": {...}}

    Bedrock:
      {"toolSpec": {"name": "foo", "description": "...", "inputSchema": {"json": {...}}}}
    """
    return [
        {
            "toolSpec": {
                "name": t["name"],
                "description": t.get("description", ""),
                "inputSchema": {"json": t["input_schema"]},
            }
        }
        for t in tools
    ]


# ── Message format conversion ─────────────────────────────────────────────────


def to_bedrock_messages(messages: list) -> list:
    """
    Convert our internal message list to Bedrock converse format.
    Handles text, tool_use, and tool_result content blocks.
    """
    bedrock_msgs = []
    for msg in messages:
        role = msg["role"]
        content = msg["content"]

        # Content can be a plain string or a list of blocks
        if isinstance(content, str):
            bedrock_msgs.append({"role": role, "content": [{"text": content}]})
            continue

        # Convert each block
        bedrock_content = []
        for block in content:
            if isinstance(block, str):
                bedrock_content.append({"text": block})

            elif isinstance(block, dict):
                btype = block.get("type")

                if btype == "text":
                    bedrock_content.append({"text": block["text"]})

                elif btype == "tool_use":
                    bedrock_content.append(
                        {
                            "toolUse": {
                                "toolUseId": block["id"],
                                "name": block["name"],
                                "input": block["input"],
                            }
                        }
                    )

                elif btype == "tool_result":
                    # tool_result goes in a user message
                    result_content = block.get("content", "")
                    if isinstance(result_content, str):
                        result_content = [{"text": result_content}]
                    bedrock_content.append(
                        {
                            "toolResult": {
                                "toolUseId": block["tool_use_id"],
                                "content": result_content,
                            }
                        }
                    )

            # SDK response objects (from Anthropic SDK) — convert to dict first
            else:
                t = getattr(block, "type", None)
                if t == "text":
                    bedrock_content.append({"text": block.text})
                elif t == "tool_use":
                    bedrock_content.append(
                        {
                            "toolUse": {
                                "toolUseId": block.id,
                                "name": block.name,
                                "input": block.input,
                            }
                        }
                    )

        if bedrock_content:
            bedrock_msgs.append({"role": role, "content": bedrock_content})

    return bedrock_msgs


# ── Response parsing ──────────────────────────────────────────────────────────


def parse_response(response: dict) -> tuple:
    """
    Parse a Bedrock converse response.
    Returns (stop_reason, content_blocks, tool_calls)

    stop_reason  : "end_turn" | "tool_use" | "max_tokens"
    content_blocks: list of dicts with type/text or type/tool_use
    tool_calls   : list of {"id", "name", "input"} dicts (empty if no tools called)
    """
    output = response.get("output", {})
    message = output.get("message", {})
    stop_reason = response.get("stopReason", "end_turn")
    raw_content = message.get("content", [])

    content_blocks = []
    tool_calls = []

    for block in raw_content:
        if "text" in block:
            content_blocks.append({"type": "text", "text": block["text"]})

        elif "toolUse" in block:
            tu = block["toolUse"]
            content_blocks.append(
                {
                    "type": "tool_use",
                    "id": tu["toolUseId"],
                    "name": tu["name"],
                    "input": tu["input"],
                }
            )
            tool_calls.append(
                {
                    "id": tu["toolUseId"],
                    "name": tu["name"],
                    "input": tu["input"],
                }
            )

    return stop_reason, content_blocks, tool_calls


def call_bedrock(
    client, model_id: str, messages: list, tools: list = None, max_tokens: int = 1024
) -> tuple:
    """
    Single call to Bedrock converse API.
    Returns (stop_reason, content_blocks, tool_calls).
    """
    kwargs = {
        "modelId": model_id,
        "messages": to_bedrock_messages(messages),
        "inferenceConfig": {
            "maxTokens": max_tokens,
            "temperature": 0.3,
        },
    }

    if tools:
        kwargs["toolConfig"] = {
            "tools": to_bedrock_tools(tools),
        }

    response = client.converse(**kwargs)
    return parse_response(response)

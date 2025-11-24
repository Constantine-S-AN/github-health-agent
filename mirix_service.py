# mirix_service.py
from fastapi import FastAPI
from pydantic import BaseModel
from mirix import Mirix
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI()

# 用 Anthropic 驱动 MIRIX
# model_provider / model 的用法参考官方 SDK 文档:contentReference[oaicite:1]{index=1}
anthropic_key = os.getenv("ANTHROPIC_API_KEY")
if not anthropic_key:
  raise RuntimeError("ANTHROPIC_API_KEY not set in environment / .env")

memory_agent = Mirix(
    api_key=anthropic_key,
    model_provider="anthropic",
    model="claude-3-sonnet",  # 可以按需要改成别的 Claude 模型
)

class AddMemoryRequest(BaseModel):
    repo: str   # e.g. "owner/repo"
    text: str   # 这次 run 的 summary

class SystemPromptRequest(BaseModel):
    repo: str
    conversation: str  # 这次调用前你整理的 conversation buffer

def get_or_create_user(repo: str):
    """
    每个 repo 在 MIRIX 里映射成一个 user：
    - 先用 list_users 查有没有 name=repo 的
    - 没有就创建一个
    """
    users = memory_agent.list_users()  # 官方支持的多用户接口:contentReference[oaicite:2]{index=2}
    for user in users:
        if user.name == repo:
            return user
    return memory_agent.create_user(user_name=repo)

@app.post("/mirix/add")
def add_memory(req: AddMemoryRequest):
    user = get_or_create_user(req.repo)
    memory_agent.add(req.text, user_id=user.id)
    return {"status": "ok"}

@app.post("/mirix/system_prompt")
def system_prompt(req: SystemPromptRequest):
    user = get_or_create_user(req.repo)
    # 官方为 Claude Agent SDK 提供的接口，用于从 MIRIX 抽取一段 system prompt memory:contentReference[oaicite:3]{index=3}
    memory_context = memory_agent.extract_memory_for_system_prompt(
        req.conversation,
        user_id=user.id,
    )
    return {"memory_context": memory_context or ""}

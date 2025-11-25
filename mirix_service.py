"""MIRIX FastAPI shim using Anthropic Claude for memory retrieval."""
from fastapi import FastAPI
from pydantic import BaseModel
from mirix import Mirix
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI()
anthropic_key = os.getenv("ANTHROPIC_API_KEY")
if not anthropic_key:
  raise RuntimeError("ANTHROPIC_API_KEY not set in environment / .env")

memory_agent = Mirix(
    api_key=anthropic_key,
    model_provider="anthropic",
    model="claude-3-sonnet-20240229"
)

class AddMemoryRequest(BaseModel):
    repo: str
    text: str

class SystemPromptRequest(BaseModel):
    repo: str
    conversation: str

def get_or_create_user(repo: str):
    users = memory_agent.list_users()
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
    memory_context = memory_agent.extract_memory_for_system_prompt(
        req.conversation,
        user_id=user.id,
    )
    return {"memory_context": memory_context or ""}

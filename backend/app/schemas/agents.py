from datetime import datetime

from pydantic import BaseModel


class Agent(BaseModel):
    agent_id: str
    name: str
    system_prompt: str
    output_key: str  # slug of name; keys recommendation.agent_outputs
    enabled: bool = True
    created_at: datetime


class AgentCreate(BaseModel):
    name: str
    system_prompt: str
    enabled: bool = True


class AgentUpdate(BaseModel):
    name: str | None = None
    system_prompt: str | None = None
    enabled: bool | None = None


class AgentListResponse(BaseModel):
    items: list[Agent]
    total: int


# ---- AI agent builder (describe in NLP -> generated system prompt) ----


class AgentChatTurn(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class AgentGenerateRequest(BaseModel):
    """A turn of the conversational agent builder.

    ``messages`` is the running chat history; ``current_*`` carry the draft the
    user currently sees so the model refines it instead of starting over.
    """

    messages: list[AgentChatTurn]
    current_name: str | None = None
    current_system_prompt: str | None = None


class AgentGenerateResponse(BaseModel):
    reply: str  # conversational explanation / clarifying question for the chat
    name: str  # suggested agent name (may be "" when only asking a question)
    system_prompt: str  # generated SafeCloud-native prompt (may be "")
    ai_enabled: bool  # False when no AI key is configured

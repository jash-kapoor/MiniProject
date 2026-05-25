from pydantic import BaseModel, EmailStr, field_validator
from datetime import datetime
from typing import Optional, List, Dict, Any

# User Schemas
class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "candidate"

class UserCreate(UserBase):
    password: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in ("candidate", "hr"):
            raise ValueError("Role must be 'candidate' or 'hr'")
        return v

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    user_id: Optional[str] = None

class UserResponse(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# Interview Schemas
class InterviewBase(BaseModel):
    job_title: str

class InterviewCreate(InterviewBase):
    pass

class InterviewResponse(InterviewBase):
    id: int
    candidate_id: int
    status: str
    created_at: datetime
    candidate: Optional[UserResponse] = None
    evaluation: Optional["EvaluationResponse"] = None

    class Config:
        from_attributes = True

# Evaluation Schemas
class EvaluationBase(BaseModel):
    speech_score: Optional[float] = None
    nlp_score: Optional[float] = None
    vision_score: Optional[float] = None
    overall_score: Optional[float] = None
    detailed_feedback: Optional[Dict[str, Any]] = None

class EvaluationCreate(EvaluationBase):
    interview_id: int

class EvaluationResponse(EvaluationBase):
    id: int
    interview_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class PaginatedInterviews(BaseModel):
    items: List[InterviewResponse]
    total: int
    skip: int
    limit: int


class PaginatedUsers(BaseModel):
    items: List[UserResponse]
    total: int
    skip: int
    limit: int


# Question Schemas
class QuestionBase(BaseModel):
    text: str
    category: str = "general"
    difficulty: str = "medium"

class QuestionCreate(QuestionBase):
    pass

class QuestionResponse(QuestionBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

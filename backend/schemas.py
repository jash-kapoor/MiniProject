from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List, Dict, Any

# User Schemas
class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "candidate"

class UserCreate(UserBase):

    password: str

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
    candidate_id: int

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

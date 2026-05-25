from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from database import Base


JSONType = JSON().with_variant(JSONB(), "postgresql")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    full_name = Column(String)
    password = Column(String)
    role = Column(String, default="candidate")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    interviews = relationship("Interview", back_populates="candidate")


class Interview(Base):
    __tablename__ = "interviews"

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("users.id"), index=True)
    job_title = Column(String)
    status = Column(String, default="pending")  # pending, completed, evaluating
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    candidate = relationship("User", back_populates="interviews")
    evaluation = relationship("Evaluation", back_populates="interview", uselist=False)


class Evaluation(Base):
    __tablename__ = "evaluations"

    id = Column(Integer, primary_key=True, index=True)
    interview_id = Column(Integer, ForeignKey("interviews.id"), index=True)
    
    # ML Outputs
    speech_score = Column(Float)
    nlp_score = Column(Float)
    vision_score = Column(Float)
    fairness_score = Column(Float)
    fairness_adjustment = Column(Float)
    overall_score = Column(Float)
    
    # Raw detailed feedback (can store JSON output from the models)
    detailed_feedback = Column(JSONType)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    interview = relationship("Interview", back_populates="evaluation")


class InterviewReport(Base):
    """
    Persists per-interview answer data, monitoring events, and violations
    so that data survives server restarts during an in-progress interview.
    """
    __tablename__ = "interview_reports"

    id = Column(Integer, primary_key=True, index=True)
    interview_id = Column(Integer, ForeignKey("interviews.id"), unique=True, index=True)
    answers = Column(JSONType, default=list)
    monitoring = Column(JSONType, default=list)
    violations = Column(JSONType, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LiveSession(Base):
    """
    Maps a unique meeting_id (UUID) to an interview_id for live sessions.
    """
    __tablename__ = "live_sessions"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(String, unique=True, index=True)
    interview_id = Column(Integer, ForeignKey("interviews.id"), index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    text = Column(String, nullable=False)
    category = Column(String, default="general")
    difficulty = Column(String, default="medium")
    created_at = Column(DateTime, default=datetime.utcnow)



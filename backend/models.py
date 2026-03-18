from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    full_name = Column(String)
    password = Column(String)
    role = Column(String, default="candidate")
    created_at = Column(DateTime, default=datetime.utcnow)

    interviews = relationship("Interview", back_populates="candidate")



class Interview(Base):
    __tablename__ = "interviews"

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("users.id"))
    job_title = Column(String)
    status = Column(String, default="pending")  # pending, completed, evaluating
    created_at = Column(DateTime, default=datetime.utcnow)

    candidate = relationship("User", back_populates="interviews")
    evaluation = relationship("Evaluation", back_populates="interview", uselist=False)


class Evaluation(Base):
    __tablename__ = "evaluations"

    id = Column(Integer, primary_key=True, index=True)
    interview_id = Column(Integer, ForeignKey("interviews.id"))
    
    # ML Outputs
    speech_score = Column(Float)
    nlp_score = Column(Float)
    vision_score = Column(Float)
    fairness_score = Column(Float)
    fairness_adjustment = Column(Float)
    overall_score = Column(Float)
    
    # Raw detailed feedback (can store JSON output from the models)
    detailed_feedback = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)

    interview = relationship("Interview", back_populates="evaluation")

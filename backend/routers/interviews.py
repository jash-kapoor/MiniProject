from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(
    prefix="/interviews",
    tags=["interviews"],
    dependencies=[Depends(get_current_user)]
)

@router.post("/", response_model=schemas.InterviewResponse)
def create_interview(interview: schemas.InterviewCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Use current_user.id as candidate_id if not provided or to ensure ownership
    candidate_id = current_user.id
    
    new_interview = models.Interview(
        candidate_id=candidate_id,
        job_title=interview.job_title,
        status="pending"
    )
    db.add(new_interview)
    db.commit()
    db.refresh(new_interview)
    return new_interview

@router.get("/", response_model=List[schemas.InterviewResponse])
def get_interviews(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    interviews = db.query(models.Interview).offset(skip).limit(limit).all()
    return interviews

@router.get("/all", response_model=List[schemas.InterviewResponse])
def get_all_interviews_detailed(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    # Using join to get candidate and evaluation if they exist
    interviews = db.query(models.Interview).offset(skip).limit(limit).all()
    # Pydantic's from_attributes will handle the relationship mapping
    return interviews
@router.get("/{interview_id}", response_model=schemas.InterviewResponse)
def get_interview(interview_id: int, db: Session = Depends(get_db)):
    db_interview = db.query(models.Interview).filter(models.Interview.id == interview_id).first()
    if not db_interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    return db_interview

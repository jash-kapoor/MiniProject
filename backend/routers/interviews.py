from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas
from auth import get_current_user, require_hr

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

@router.get("/", response_model=schemas.PaginatedInterviews)
def get_interviews(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(models.Interview)
    total = query.count()
    interviews = query.offset(skip).limit(limit).all()
    return {"items": interviews, "total": total, "skip": skip, "limit": limit}

@router.get("/all", response_model=schemas.PaginatedInterviews)
def get_all_interviews_detailed(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_hr),
):
    query = db.query(models.Interview)
    total = query.count()
    interviews = query.offset(skip).limit(limit).all()
    return {"items": interviews, "total": total, "skip": skip, "limit": limit}

@router.get("/{interview_id}", response_model=schemas.InterviewResponse)
def get_interview(interview_id: int, db: Session = Depends(get_db)):
    db_interview = db.query(models.Interview).filter(models.Interview.id == interview_id).first()
    if not db_interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    return db_interview

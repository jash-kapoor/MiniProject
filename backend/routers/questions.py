from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
import models
import schemas
from auth import require_hr

router = APIRouter(
    prefix="/questions",
    tags=["questions"],
)

@router.get("/", response_model=List[schemas.QuestionResponse])
def get_questions(db: Session = Depends(get_db)):
    return db.query(models.Question).all()

@router.post("/", response_model=schemas.QuestionResponse)
def create_question(
    question: schemas.QuestionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_hr),
):
    new_q = models.Question(**question.model_dump())
    db.add(new_q)
    db.commit()
    db.refresh(new_q)
    return new_q

@router.delete("/{question_id}")
def delete_question(
    question_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_hr),
):
    q = db.query(models.Question).filter(models.Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    db.delete(q)
    db.commit()
    return {"message": "Question deleted"}

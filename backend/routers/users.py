from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
import models
import schemas

from fastapi.security import OAuth2PasswordRequestForm
from auth import get_password_hash, verify_password, create_access_token, get_current_user, require_hr
from rate_limit import limiter

router = APIRouter(
    prefix="/users",
    tags=["users"],
)

@router.post("/signup", response_model=schemas.UserResponse)
@limiter.limit("5/minute")
def signup(request: Request, response: Response, user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    if user.role not in ("candidate", "hr"):
        raise HTTPException(status_code=400, detail="Role must be 'candidate' or 'hr'")
    
    hashed_password = get_password_hash(user.password)
    new_user = models.User(
        email=user.email, 
        full_name=user.full_name,
        password=hashed_password,
        role=user.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.post("/login", response_model=schemas.Token)
@limiter.limit("10/minute")
def login(request: Request, response: Response, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": str(user.id)})
    response.set_cookie(
        key="voxassess_session",
        value=access_token,
        httponly=True,
        secure=False,  # Set True in production with HTTPS
        samesite="lax",
        max_age=86400,  # 24 hours
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key="voxassess_session")
    return {"message": "Logged out successfully"}

@router.get("/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user

@router.get("/me/interviews", response_model=List[schemas.InterviewResponse])
def get_my_interviews(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    interviews = db.query(models.User).filter(models.User.id == current_user.id).first().interviews
    return interviews

@router.get("/", response_model=schemas.PaginatedUsers)
def get_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_hr),
):
    query = db.query(models.User)
    total = query.count()
    users = query.offset(skip).limit(limit).all()
    return {"items": users, "total": total, "skip": skip, "limit": limit}

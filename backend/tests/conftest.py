import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app
from auth import get_password_hash
import models


TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def test_candidate(db_session):
    user = models.User(
        email="candidate@test.com",
        full_name="Test Candidate",
        password=get_password_hash("testpass123"),
        role="candidate",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def test_hr(db_session):
    user = models.User(
        email="hr@test.com",
        full_name="Test HR",
        password=get_password_hash("testpass123"),
        role="hr",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(autouse=True)
def disable_rate_limiter():
    from rate_limit import limiter
    original_enabled = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = original_enabled


@pytest.fixture
def candidate_token(client, test_candidate):
    client.cookies.clear()
    response = client.post(
        "/users/login",
        data={"username": test_candidate.email, "password": "testpass123"},
    )
    token = response.json()["access_token"]
    client.cookies.clear()
    return token


@pytest.fixture
def hr_token(client, test_hr):
    client.cookies.clear()
    response = client.post(
        "/users/login",
        data={"username": test_hr.email, "password": "testpass123"},
    )
    token = response.json()["access_token"]
    client.cookies.clear()
    return token


@pytest.fixture
def auth_headers(candidate_token):
    return {"Authorization": f"Bearer {candidate_token}"}


@pytest.fixture
def hr_headers(hr_token):
    return {"Authorization": f"Bearer {hr_token}"}


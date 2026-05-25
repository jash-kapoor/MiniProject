def test_signup_candidate(client):
    response = client.post(
        "/users/signup",
        json={"email": "new@test.com", "full_name": "New User", "password": "pass123", "role": "candidate"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "new@test.com"
    assert data["role"] == "candidate"


def test_signup_hr(client):
    response = client.post(
        "/users/signup",
        json={"email": "hr_new@test.com", "full_name": "New HR", "password": "pass123", "role": "hr"},
    )
    assert response.status_code == 200
    assert response.json()["role"] == "hr"


def test_signup_invalid_role(client):
    response = client.post(
        "/users/signup",
        json={"email": "bad@test.com", "full_name": "Bad", "password": "pass123", "role": "admin"},
    )
    assert response.status_code in (400, 422)


def test_signup_duplicate_email(client, test_candidate):
    response = client.post(
        "/users/signup",
        json={"email": "candidate@test.com", "full_name": "Dup", "password": "pass123"},
    )
    assert response.status_code == 400


def test_login_success(client, test_candidate):
    response = client.post(
        "/users/login",
        data={"username": "candidate@test.com", "password": "testpass123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    # Check that httponly cookie is set
    assert "voxassess_session" in response.cookies


def test_login_wrong_password(client, test_candidate):
    response = client.post(
        "/users/login",
        data={"username": "candidate@test.com", "password": "wrongpass"},
    )
    assert response.status_code == 401


def test_get_me(client, auth_headers):
    response = client.get("/users/me", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["email"] == "candidate@test.com"


def test_get_me_no_auth(client):
    response = client.get("/users/me")
    assert response.status_code == 401


def test_logout(client, test_candidate):
    # Login first to get cookie
    login_res = client.post(
        "/users/login",
        data={"username": "candidate@test.com", "password": "testpass123"},
    )
    assert "voxassess_session" in login_res.cookies

    # Logout
    logout_res = client.post("/users/logout")
    assert logout_res.status_code == 200


def test_require_hr_as_candidate(client, auth_headers):
    """Candidates should not access HR-only endpoints."""
    response = client.get("/users/", headers=auth_headers)
    assert response.status_code == 403


def test_require_hr_as_hr(client, hr_headers):
    """HR users should access HR-only endpoints."""
    response = client.get("/users/", headers=hr_headers)
    assert response.status_code == 200
